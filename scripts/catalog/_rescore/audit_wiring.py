"""Full wiring + metadata audit of the ARTCOVR catalog.
Read-only. Reports every mismatch it can prove."""
import os, json, re, hashlib, struct
from collections import Counter, defaultdict
CAT=r"C:\Users\serge\Desktop\ARTCOVR"
AD=os.path.join(CAT,"public","assets","artworks")
fail=defaultdict(list); info={}; styleB=[]

def J(*p): return json.load(open(os.path.join(CAT,*p),encoding="utf-8"))
appr=J("catalog","approved-artworks.json"); appr.sort(key=lambda r:r["position"])
info["approved rows"]=len(appr)

def dims(b):
    if b[:8]==b"\x89PNG\r\n\x1a\n": return ("png",)+struct.unpack(">II",b[16:24])
    if b[:2]==b"\xff\xd8":
        i=2
        while i<len(b)-9:
            if b[i]!=0xFF: i+=1; continue
            m=b[i+1]
            if m in (0xC0,0xC1,0xC2,0xC3,0xC5,0xC6,0xC7,0xC9,0xCA,0xCB,0xCD,0xCE,0xCF):
                h,w=struct.unpack(">HH",b[i+5:i+9]); return ("jpeg",w,h)
            if m in (0xD8,0xD9) or 0xD0<=m<=0xD7: i+=2; continue
            i+=2+struct.unpack(">H",b[i+2:i+4])[0]
    return ("?",0,0)

# ---------- 1. rows: identity, files, dimensions ----------
slugs=Counter(); shas=Counter(); ids=Counter()
for i,r in enumerate(appr):
    slugs[r["slug"]]+=1; shas[r["sha256"]]+=1; ids[r["id"]]+=1
    if r["position"]!=i+1: fail["position not contiguous"].append(r["slug"])
    exp="art_"+r["sha256"][:20]
    if r["id"]!=exp: fail["id does not equal art_<sha[:20]>"].append("%s (%s vs %s)"%(r["slug"],r["id"],exp))
    if r["displayPath"]!="/assets/artworks/%s.jpg"%r["slug"]:
        fail["displayPath does not match slug"].append(r["slug"])
    if r["privateBasePath"]!="artworks/%s/base"%r["id"]:
        fail["privateBasePath does not match id"].append(r["slug"])
    p=os.path.join(AD,r["slug"]+".jpg")
    if not os.path.exists(p): fail["display file missing"].append(r["slug"]); continue
    b=open(p,"rb").read(); f,w,h=dims(b)
    if f!="jpeg": fail["display file is not jpeg"].append(r["slug"])
    if w!=h: fail["display file not square"].append("%s %dx%d"%(r["slug"],w,h))
for k,c in (("duplicate slug",slugs),("duplicate sha256",shas),("duplicate id",ids)):
    for v,n in c.items():
        if n>1: fail[k].append("%s x%d"%(v,n))
orphan=[f for f in os.listdir(AD) if f.endswith(".jpg") and f[:-4] not in slugs]
if orphan: fail["display file with no catalog row"]=orphan
info["display files"]=len([f for f in os.listdir(AD) if f.endswith(".jpg")])

# ---------- 2. cross-artifact parity ----------
def parity(name, rows, keyfn):
    if len(rows)!=len(appr):
        fail["row-count parity"].append("%s has %d, approved has %d"%(name,len(rows),len(appr))); return
    for a,b in zip(appr,rows):
        if keyfn(b)!=a["slug"]:
            fail["order parity"].append("%s: %s vs %s"%(name,keyfn(b),a["slug"])); return
for nm,path,key in [("curated-artworks",("catalog","curated-artworks.json"),"slug"),
                    ("curated-review",("src","lib","artcovr","curated-review.json"),"slug"),
                    ("curated-public",("src","lib","artcovr","curated-public.json"),"slug")]:
    try: parity(nm, J(*path), lambda r,k=key: r.get(k))
    except FileNotFoundError: fail["artifact missing"].append(nm)

# ---------- 3. launch-selection.ts <-> approved rows ----------
ls=open(os.path.join(CAT,"src","lib","artcovr","launch-selection.ts"),encoding="utf-8").read()
body=ls.split("export const launchSelection")[-1]
sel_sha=re.findall(r'sourceSha256:\s*"([0-9a-f]{64})"', ls)
appr_sha=[r["sha256"] for r in appr]
missing=[s for s in appr_sha if s not in ls]
info["approved SHAs absent from launch-selection.ts"]=len(missing)
if missing: fail["launch-selection out of sync with approved catalog"]=missing[:6]+(["...+%d more"%(len(missing)-6)] if len(missing)>6 else [])
info["launch-selection has rescore block"]="rescoreLaunchSelection" in ls

# ---------- 4. metadata self-consistency ----------
CATS={"Graphic / Illustration / Print","Surreal / Hybrid","Minimal / Abstract",
      "Mixed Media / Collage","Painterly / Illustrative","Material / Sculptural / Organic",
      "Digital / Computational"}
for r in appr:
    m=r.get("metadata") or {}
    if r["category"] not in CATS: fail["unknown category"].append("%s: %s"%(r["slug"],r["category"]))
    if [t.strip() for t in r.get("mood","").split(",") if t.strip()]!=r.get("moodTags"):
        fail["mood string != moodTags"].append(r["slug"])
    if len(r.get("moodTags") or [])<3: fail["fewer than 3 moodTags"].append(r["slug"])
    alt=r.get("alt","")
    if not alt.strip(): fail["alt empty"].append(r["slug"])
    elif r["title"] not in alt and alt.strip()!=r["description"].strip():
        fail["alt is neither 'Title: description' nor the description"].append(r["slug"])
    elif r["title"] not in alt: styleB.append(r["slug"])
    st=m.get("searchText","")
    for part in (r["title"], r["description"], r["category"]):
        if part and part not in st: fail["searchText missing a field"].append("%s (%s)"%(r["slug"],part[:18])); break
    kw=m.get("keywords") or []
    # keywords may be ENRICHED beyond the description (facet tags added by the
    # 2026-08-14 enrichment swap), so require containment, not equality -- and only
    # when the description is actually a comma-separated term list.
    if kw and "," in r["description"] and not r["description"].endswith("."):
        terms=[k.strip() for k in r["description"].split(",")]
        missing=[t for t in terms if t not in kw]
        if missing: fail["description term absent from keywords"].append("%s: %s"%(r["slug"],missing[:2]))
    if m.get("styleFamily") and m["styleFamily"]!=r["category"]:
        fail["styleFamily != category"].append(r["slug"])
    for req in ("title","description","alt","category","sha256","displayPath"):
        if not r.get(req): fail["empty required field"].append("%s.%s"%(r["slug"],req))
    if r.get("rightsApproved") is not True or r.get("published") is not True:
        fail["row not approved/published"].append(r["slug"])

# ---------- 5. my staged swap artifacts ----------
ST=os.path.join(CAT,"outputs","catalog","regen-picks-2026-08-14")
spec_p=os.path.join(CAT,"catalog","swaps","2026-08-14-collection-rescore.json")
if os.path.exists(spec_p):
    spec=json.load(open(spec_p,encoding="utf-8"))
    live={r["slug"] for r in appr}
    for w in spec["works"]:
        f=os.path.join(ST,w["sourceFile"])
        if not os.path.exists(f): fail["staged source missing"].append(w["sourceFile"]); continue
        b=open(f,"rb").read(); h=hashlib.sha256(b).hexdigest()
        if h!=w["sha256"]: fail["staged source sha mismatch"].append(w["sourceFile"])
        if not h.startswith(os.path.splitext(w["sourceFile"])[0]): fail["staged filename not sha prefix"].append(w["sourceFile"])
        if w["replaces"] not in live: fail["spec replaces a slug not in catalog"].append(w["replaces"])
    info["swap spec works"]=len(spec["works"])

print("=== COUNTS ===")
for k,v in info.items(): print("  %-52s %s"%(k,v))
info["alt style A (Title: description)"]=len(appr)-len(styleB)
info["alt style B (description only)"]=len(styleB)
print("\n=== FINDINGS ===")
if not fail: print("  none - everything checked is consistent")
for k,v in sorted(fail.items(), key=lambda kv:-len(kv[1])):
    print("  [%d] %s"%(len(v),k))
    for x in list(v)[:5]: print("        - %s"%x)
    if len(v)>5: print("        ...+%d more"%(len(v)-5))
