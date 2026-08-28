import os, json, textwrap
from PIL import Image, ImageDraw
CAT=r"C:\Users\serge\Desktop\ARTCOVR"; AD=os.path.join(CAT,"public","assets","artworks")
OUT=os.path.join(r"E:\ART_COLLECTION",".artcovr-scoring","meta_check")
os.makedirs(OUT,exist_ok=True)
a=json.load(open(os.path.join(CAT,"catalog","approved-artworks.json"),encoding="utf-8")); a.sort(key=lambda r:r["position"])
S=330; TXT=96; cols=5; per=25
for k in range(0,len(a),per):
    grp=a[k:k+per]; rn=(len(grp)+cols-1)//cols
    im=Image.new("RGB",(cols*S, rn*(S+TXT)),(16,16,18)); d=ImageDraw.Draw(im)
    for i,r in enumerate(grp):
        x=(i%cols)*S; y=(i//cols)*(S+TXT)
        try:
            t=Image.open(os.path.join(AD,r["slug"]+".jpg")).convert("RGB").resize((S,S),Image.LANCZOS)
            im.paste(t,(x,y))
        except Exception: d.text((x+8,y+8),"MISSING",fill=(255,70,70))
        d.text((x+6,y+S+5), "%d. %s"%(r["position"], r["title"][:30]), fill=(255,255,255))
        d.text((x+6,y+S+22), r["category"][:34], fill=(140,190,255))
        for j,line in enumerate(textwrap.wrap(r["description"],44)[:3]):
            d.text((x+6,y+S+38+j*15), line, fill=(190,190,195))
    p=os.path.join(OUT,"meta_%02d.jpg"%(k//per+1)); im.save(p,quality=88)
    print(p, im.size, "rows %d-%d"%(grp[0]["position"],grp[-1]["position"]))
