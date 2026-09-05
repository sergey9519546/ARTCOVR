/**
 * Owner-approved source pools.
 *
 * The first five are direct-use pools: an existing file is selected, hashed,
 * and reviewed as-is. `regenerated_originals` is different in kind — it holds
 * NEW works produced from an original, owner-directed regeneration brief that
 * was informed by a blocked, regeneration-only reference pool. No reference
 * file, reference hash, or reference-derived metadata enters the catalog; only
 * the freshly generated, re-hashed, visually reviewed output does.
 */
export type DirectSourcePool =
  | "generated_images"
  | "new_meta_images"
  | "meta_updated_images"
  | "concept_reference_art"
  | "new_download_root"
  | "regenerated_originals";

export const LAUNCH_SOURCE_POOLS: readonly DirectSourcePool[] = [
  "generated_images",
  "new_meta_images",
  "meta_updated_images",
  "concept_reference_art",
  "new_download_root",
  "regenerated_originals",
];

export type LaunchSelection = {
  sourcePool: DirectSourcePool;
  sourceOrdinal?: number;
  sourceSha256?: string;
  category: string;
  moodTags: readonly string[];
  reviewFlags: readonly string[];
  /**
   * Regeneration-brief series for `regenerated_originals` rows only. It names
   * the owner's original brief family; it is never a claim about a reference
   * file's authorship or metadata.
   */
  referenceSeries?: "gothic_surrealism" | "modern_surrealism";
};

type ReviewedSelectionRecord = {
  sha256: string;
  category: string;
  moodTags: [string, string, string];
};

// Kept in the same order as the SHA-locked review file generated from the
// concept contact-sheet audit. These values contain no inferred prompt data.
const reviewedConceptSelection: readonly ReviewedSelectionRecord[] = [
  { sha256: "6da3a7473dbfdf826e6c2b9f6267881bf3280642a84e0b1a98494b3a7b122b1a", category: "Surreal / Hybrid", moodTags: ["temporal", "graphic", "uncanny"] },
  { sha256: "8a1b6f2d3f74c098f243cadcb319fccfc949130d33e24ae04cef8bf2fc9ce903", category: "Surreal / Hybrid", moodTags: ["verdant", "quiet", "inventive"] },
  { sha256: "b3f4491ac7965631b3b1a5ffc1481bd435238dc21c41c22b90a5060ba3362e8c", category: "Graphic / Illustration / Print", moodTags: ["wry", "minimal", "sunlit"] },
  { sha256: "c73360b8f81c50b57ad0237aed8747925ad2d40e982fb528fca2422166e8e552", category: "Surreal / Hybrid", moodTags: ["stormy", "poetic", "spare"] },
  { sha256: "dfead6e9a75acb469725cc3c2ee174b2dc34adfc9c1c4c4f1a9f15dea7c0c4ad", category: "Graphic / Illustration / Print", moodTags: ["sharp", "minimal", "enigmatic"] },
  { sha256: "f2835117b4c4ae98b6e20bb13297363112b37b146113fa20fb8463aca82d944a", category: "Mixed Media / Collage", moodTags: ["architectural", "balanced", "quiet"] },
  { sha256: "bd41353a5408921c7d58f6edc290fff1055449efaf0809ad554330ded0d2cae9", category: "Mixed Media / Collage", moodTags: ["layered", "cyan", "enigmatic"] },
  { sha256: "fd84809ef1554e0a786922a02e1c9c2a0a9ab8d6d012389c92d82e40940f8c43", category: "Minimal / Abstract", moodTags: ["systemic", "kinetic", "graphic"] },
  { sha256: "0f35c7c5c3ddc2eec9eb669133ddcf8da66fb1c62cd09b48ca99b1b659bf65d4", category: "Graphic / Illustration / Print", moodTags: ["solitary", "theatrical", "minimal"] },
  { sha256: "77c70ed3ed2d410dbfd5d435b47570f9ad7878ad07046b61b412b890d76eaa1f", category: "Minimal / Abstract", moodTags: ["open", "organic", "meditative"] },
  { sha256: "95b953c39ee6f78c922b6b8f77600c642b6819b9080d1b2236db8d2bd2977d23", category: "Graphic / Illustration / Print", moodTags: ["monumental", "archival", "symbolic"] },
  { sha256: "a22e035c417e6e774d51180bc8517cb33094c32982728b44e535c8ff7b72d373", category: "Graphic / Illustration / Print", moodTags: ["deadpan", "surreal", "graphic"] },
  { sha256: "0e872f93a29287069ecd0b034eb0b39f194b0fdb79b6580a2faa24f187d5927f", category: "Mixed Media / Collage", moodTags: ["weightless", "mechanical", "graphic"] },
  { sha256: "6baed7162ea6572b24345aeb40da9be0d737df2fe201f360d68b5f84696a77c5", category: "Material / Sculptural / Organic", moodTags: ["compressed", "tactile", "strange"] },
  { sha256: "f271bff03a4a8bf3660cd120cbee569e37284a34c8248436a4b282418d9e0496", category: "Graphic / Illustration / Print", moodTags: ["liminal", "architectural", "stark"] },
  { sha256: "c70963dfd83c1b3cd4dc760c71e0058b50aa1be1eb4debd584806d2e00cee366", category: "Graphic / Illustration / Print", moodTags: ["analog", "rooted", "electric"] },
  { sha256: "8d7e7164e829ecdb2c960883d749a4b31194f21a5aa43b20f0677a15d7b117fc", category: "Graphic / Illustration / Print", moodTags: ["watchful", "melancholic", "graphic"] },
  { sha256: "c757341870883fc1c55dff085cfa74c7b072524341062edda29a39d29ece106d", category: "Surreal / Hybrid", moodTags: ["contained", "mysterious", "playful"] },
  { sha256: "78dbbe3b64a54b0969a96cdff76f4b4a05c5d3d125f0ab1cab24e2f7a88fd55d", category: "Graphic / Illustration / Print", moodTags: ["urban", "organic", "precise"] },
  { sha256: "af133895ec864914fc6249774edbc4ff684d1d07aafe4935ff95ecd7eead42b0", category: "Surreal / Hybrid", moodTags: ["tidal", "contained", "dreamlike"] },
  { sha256: "fd6312bbd6441c9e025a2cb534c11c863bf72fa3a5f4b18aa5b66bb0d96124e2", category: "Minimal / Abstract", moodTags: ["luminous", "fragile", "quiet"] },
  { sha256: "d27b6457129241d3a6a6772d7b428ad4341986170f9dd146957ecd8c52d8f3d4", category: "Minimal / Abstract", moodTags: ["connected", "kinetic", "organic"] },
  { sha256: "9401682d689b745117c14a6166ff0147431853476edebf00920065cc200a9e6b", category: "Surreal / Hybrid", moodTags: ["cosmic", "poignant", "still"] },
  { sha256: "a9db588e9d9142ad503e70bcc8beb6be7016b90280a31952d647c935466c9869", category: "Surreal / Hybrid", moodTags: ["adrift", "quiet", "uncanny"] },
  { sha256: "4a75bfcdf2490e7a4b8375ab848e94ef57409107f8f196e68a54e96eb69be0e8", category: "Surreal / Hybrid", moodTags: ["domestic", "volatile", "inventive"] },
  { sha256: "7042fab38aac05f1101fd6d19918eda41b0426e1d20cfc770c01633841014fcb", category: "Surreal / Hybrid", moodTags: ["abandoned", "ember-lit", "strange"] },
  { sha256: "9fc168e232a06e37ad417a5d253748b7f4e3376a7e4a8a23a9fc0af6cb3d4dd0", category: "Surreal / Hybrid", moodTags: ["stormy", "delicate", "whimsical"] },
  { sha256: "382f017ddadad8dcd971a8b0e6e0afaad4c3628c5b4e3ec55ad6f8ef1bcc1eec", category: "Surreal / Hybrid", moodTags: ["temporal", "tactile", "uncanny"] },
  { sha256: "ee6e7132fe55b92cf922f3d31ebe1712354f0534ec246f0ba1284f0a2424aac2", category: "Graphic / Illustration / Print", moodTags: ["inverted", "graphic", "stormy"] },
  { sha256: "715fddc62e34dbc2144ffd4ac3bcd4844a862280a5c4e73d87c1646a9df7f068", category: "Surreal / Hybrid", moodTags: ["domestic", "smoldering", "wry"] },
  { sha256: "578ee281ba438155ef1483e4c796bbad88b6d19e2086e0aecf5d6e488d5fe660", category: "Mixed Media / Collage", moodTags: ["lunar", "layered", "quiet"] },
  { sha256: "627f08639fb16e98793409fc11a584596e012541f117aa5a423fde9e67d01a1c", category: "Minimal / Abstract", moodTags: ["symbolic", "airy", "precise"] },
  { sha256: "837796045f02035616223e459dd057a17fcd2d18a41e94ab013a7cc57cd9d47b", category: "Surreal / Hybrid", moodTags: ["reflective", "contained", "dreamlike"] },
  { sha256: "74de779f9a50949005141f0edc0b0b734ea15df987c6ae7675ebe096ac9184b8", category: "Graphic / Illustration / Print", moodTags: ["ascending", "architectural", "enigmatic"] },
  { sha256: "9cb1a2fe81ec0abab1d40978aa5dfc2ad08cda2f6c6bc90e28976126b615eb0f", category: "Surreal / Hybrid", moodTags: ["mechanical", "blooming", "precise"] },
  { sha256: "09792071af253ce5ced717a2bab7fcb367fd38485f0d1be668b2bcea03be79fa", category: "Minimal / Abstract", moodTags: ["spare", "final", "warm"] },
  { sha256: "28e4e00053befb00ef934ae5af35ed33f99ae621cd476342d5efdfdb88447c8e", category: "Surreal / Hybrid", moodTags: ["ascending", "warm", "inventive"] },
  { sha256: "de1b7dfed90adeb258684381d707d87bdabf6b4b1d47ee1edac862e71d9d0e4d", category: "Graphic / Illustration / Print", moodTags: ["airy", "impossible", "minimal"] },
  { sha256: "1867ad4d47f6cf11809651b528449ce535ace742d3b8a5282c87dd1029ed352b", category: "Graphic / Illustration / Print", moodTags: ["anticipatory", "quiet", "symbolic"] },
  { sha256: "8d826a0a155a513e16e9785029d6ced017d587c243e8f4d7fb57d35d7f207b1c", category: "Mixed Media / Collage", moodTags: ["luminous", "graphic", "renewed"] },
  { sha256: "2da8f2c43d592abc4820ef2627fe02743a54d8e58499331a560737ada672c816", category: "Graphic / Illustration / Print", moodTags: ["mechanical", "tender", "precise"] },
  { sha256: "833e2718e7baccc724754dbea0b9968625cecb49e813416a3a3ab5775ada93bf", category: "Graphic / Illustration / Print", moodTags: ["urban", "absurd", "playful"] },
  { sha256: "0a89082cf7ea6fdc8053405363a009b783578e9e191db0a72983a9ea7a727a03", category: "Mixed Media / Collage", moodTags: ["lunar", "distressed", "enigmatic"] },
  { sha256: "81ef9c04560ca0aeda35e3937affa90620d5dc3006a6c877132cb9539dcd22ec", category: "Graphic / Illustration / Print", moodTags: ["avian", "bold", "graphic"] },
  { sha256: "fa434ce71985f9d2d728f4d804075f2df8d75bedce39b9b5f7c9c686feea217f", category: "Graphic / Illustration / Print", moodTags: ["symbolic", "architectural", "precise"] },
  { sha256: "3f42d6c658f7d1f939c8985dbbd92cd2d6332c5a4d1f4f37c17b5c4e65b6c012", category: "Mixed Media / Collage", moodTags: ["mechanical", "botanical", "intricate"] },
  { sha256: "131d1c582019d52f601ed13bae03ccf8f73b9716981edf3839e78f151095af55", category: "Surreal / Hybrid", moodTags: ["electric", "delicate", "organic"] },
  { sha256: "b1f1040d07c0d4c630d50f6ed1315735acf8690e37d0245068cfb0dc54233658", category: "Surreal / Hybrid", moodTags: ["contained", "architectural", "dreamlike"] },
  { sha256: "18cbf168a4cb315e911bfda723ba5e2be0012623b58e5ba2d8946e59c7b58ab6", category: "Mixed Media / Collage", moodTags: ["mechanical", "mythic", "precise"] },
  { sha256: "97d06554f98ac4a01acb9ed28071a83a2752253ba04d96956e76ffe570978b2c", category: "Surreal / Hybrid", moodTags: ["melted", "mechanical", "expressive"] },
  { sha256: "8a962fbd0ab5e17817b6da957396935c6edd4af7bb7d167fc2b6c84db0555c26", category: "Graphic / Illustration / Print", moodTags: ["functional", "precise", "wry"] },
  { sha256: "2ba4375af85a094747a99474c07882b1c767a490eaea57087d57f871cbaeef4d", category: "Surreal / Hybrid", moodTags: ["domestic", "cool", "uncanny"] },
  { sha256: "71ce1a2a8a217f9a28c20b4f6b693ffae2882d702de85867004edc59df5a1198", category: "Mixed Media / Collage", moodTags: ["fragmented", "tactile", "expressive"] },
  { sha256: "1f4f5cd44cd269966214f8a0a22b435898e750b091093d6070a4aa223aea0431", category: "Surreal / Hybrid", moodTags: ["layered", "architectural", "absurd"] },
  { sha256: "e6912b15c7cd4d65cec89588a9fff9cabadf5dcd55f7b965b85b34fdfaaac161", category: "Graphic / Illustration / Print", moodTags: ["domestic", "miniature", "wry"] },
  { sha256: "ca24dc2ffebcfb0510430b41e8420d7f8f7a01d219fde0d751ea17c68c362aa1", category: "Graphic / Illustration / Print", moodTags: ["botanical", "nostalgic", "quiet"] },
  { sha256: "f9ce6d0c0217d5729eb02b32051cfb4ec8f5ba3443c2b35143c7fb347787c088", category: "Surreal / Hybrid", moodTags: ["flowing", "graphic", "strange"] },
  { sha256: "d59d96a2244e080de51dc35fc4c7fefcbde559502869d7f29ed80c7d7c168a6a", category: "Graphic / Illustration / Print", moodTags: ["silent", "graphic", "wry"] },
  { sha256: "7383709e7f556976846865c68cbcf52ec6e8f2326f25b37e85a07dcfb5b168cf", category: "Graphic / Illustration / Print", moodTags: ["urban", "solitary", "symbolic"] },
  { sha256: "ec167f53be46f41b5787d57141d90edcd452af0f446f1e1b6daae1075eb2da8b", category: "Graphic / Illustration / Print", moodTags: ["vertical", "atmospheric", "graphic"] },
];

const conceptLaunchSelection = reviewedConceptSelection.map(
  ({ sha256, category, moodTags }): LaunchSelection => ({
    sourcePool: "concept_reference_art",
    sourceSha256: sha256,
    category,
    moodTags,
    reviewFlags: [],
  }),
);

const retainedMetaSelection: readonly LaunchSelection[] = [
  { sourcePool: "new_meta_images", sourceSha256: "2973a68902d5428a7e0a4904d0cb9bf99ff9294b75e95e08fe7daaa44b99465d", category: "Material / Sculptural / Organic", moodTags: ["solitary", "sculptural", "storm-lit"], reviewFlags: [] },
  { sourcePool: "new_meta_images", sourceSha256: "b1fbacd89915f78dcc3565d500b9d0df4aac74edf08a00be7829a22b219f5a83", category: "Minimal / Abstract", moodTags: ["vast", "architectural", "serene"], reviewFlags: [] },
  { sourcePool: "new_meta_images", sourceSha256: "890f397c8d4f3ee5bccb90dc0b9eb8090552f29d22e25fb33774e016a18361f0", category: "Surreal / Hybrid", moodTags: ["luminous", "tranquil", "celestial"], reviewFlags: [] },
  { sourcePool: "new_meta_images", sourceSha256: "33adf63fdc4cff78989d3762fca982ebcdb2b4c37b0d226d623a00f807e0ac4f", category: "Graphic / Illustration / Print", moodTags: ["graphic", "cosmic", "weathered"], reviewFlags: [] },
  { sourcePool: "meta_updated_images", sourceSha256: "6ecb2b7f031cdd95453f7fd5c5888e60414ddd2e6057e8b4faa2589fe41094ce", category: "Graphic / Illustration / Print", moodTags: ["feral", "botanical", "high-contrast"], reviewFlags: [] },
  { sourcePool: "new_meta_images", sourceSha256: "f4f72512dd71fff29a9f61068dc27c76453cf5476ed90decd051e75c6e27b4e5", category: "Surreal / Hybrid", moodTags: ["subterranean", "luminous", "architectural"], reviewFlags: [] },
  { sourcePool: "new_meta_images", sourceSha256: "9423d95f6320303cb2c4056b8f50733c35bdad57f7a7cfe75949c91d8d4c3ba0", category: "Painterly / Illustrative", moodTags: ["glacial", "quiet", "otherworldly"], reviewFlags: [] },
  { sourcePool: "new_meta_images", sourceSha256: "67b7593dec53d1f531d4b002098cfc394b9de61f93ddc5c9ae25ce74a1150a6f", category: "Surreal / Hybrid", moodTags: ["monumental", "desert", "speculative"], reviewFlags: [] },
  { sourcePool: "new_meta_images", sourceSha256: "07bdf5aba1e72db9acd78836ef8489fb96b5e4c656ccf931ecf8dc421da2474a", category: "Surreal / Hybrid", moodTags: ["emerald", "monumental", "enigmatic"], reviewFlags: [] },
  { sourcePool: "new_meta_images", sourceSha256: "359bd0a10815d29b69f5fb017bf8ef70aa9418c0b58638c832cc0594d00fb2aa", category: "Graphic / Illustration / Print", moodTags: ["playful", "mechanical", "sunlit"], reviewFlags: [] },
  { sourcePool: "new_meta_images", sourceSha256: "d1ca9ed8d6c3f8f8337ba22eae8ce1d9752cf1497d5fc45224ceaf457f16d2cf", category: "Graphic / Illustration / Print", moodTags: ["celestial", "contemplative", "symbolic"], reviewFlags: [] },
  { sourcePool: "new_meta_images", sourceSha256: "8fe11ce5bcbed92880b1eaec4696f4d55e6d57b460146dfdeba033a3dec6230c", category: "Graphic / Illustration / Print", moodTags: ["archival", "mysterious", "solitary"], reviewFlags: [] },
  { sourcePool: "new_meta_images", sourceSha256: "5e8537a9e84a63c445769539dec7cc83cd3b9d82111c9e613568a5b94330870b", category: "Graphic / Illustration / Print", moodTags: ["whimsical", "scholarly", "warm"], reviewFlags: [] },
];

const retainedGeneratedSelection: readonly LaunchSelection[] = [
  { sourcePool: "generated_images", sourceOrdinal: 13, category: "Minimal / Abstract", moodTags: ["electric", "cobalt", "minimal"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 56, category: "Graphic / Illustration / Print", moodTags: ["vibrant", "risograph", "surreal"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 37, category: "Graphic / Illustration / Print", moodTags: ["graphic", "angular", "urban"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 123, category: "Material / Sculptural / Organic", moodTags: ["botanical", "ornate", "surreal"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 20, category: "Digital / Computational", moodTags: ["monochrome", "glitch", "abstract"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 22, category: "Graphic / Illustration / Print", moodTags: ["graphic", "surreal", "minimal"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 26, category: "Minimal / Abstract", moodTags: ["kinetic", "ghostly", "minimal"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 27, category: "Material / Sculptural / Organic", moodTags: ["velvet", "moss", "surreal"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 44, category: "Digital / Computational", moodTags: ["corrupted", "digital", "dreamlike"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 48, category: "Surreal / Hybrid", moodTags: ["saturated", "surreal", "pop"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 65, category: "Graphic / Illustration / Print", moodTags: ["graphic", "kinetic", "surreal"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 68, category: "Minimal / Abstract", moodTags: ["textured", "geometric", "minimal"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 72, category: "Painterly / Illustrative", moodTags: ["luminous", "cosmic", "folkloric"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 78, category: "Painterly / Illustrative", moodTags: ["ethereal", "painterly", "botanical"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 91, category: "Graphic / Illustration / Print", moodTags: ["monochrome", "gothic", "print"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 103, category: "Graphic / Illustration / Print", moodTags: ["bold", "graphic", "neon"], reviewFlags: [] },
];

// Exactly 100 owner-review candidates. Every key below resolves to an audited
// SHA-256 identity; no removed file, filename-only guess, or padded duplicate is used.
/* Historical selection retained only in git history; never keep rejected
 * identities or removed visual language in executable/catalog source.
const previousLaunchSelection: readonly LaunchSelection[] = [
  ...conceptLaunchSelection,
  { sourcePool: "new_meta_images", sourceSha256: "2973a68902d5428a7e0a4904d0cb9bf99ff9294b75e95e08fe7daaa44b99465d", category: "Material / Sculptural / Organic", moodTags: ["solitary", "sculptural", "storm-lit"], reviewFlags: [] },
  { sourcePool: "concept_reference_art", sourceSha256: "b26a5c7a2c6e76d45ad1e0d2c3326a9c071f32e4d9aac86f38d3cb2f395c8407", category: "Graphic / Illustration / Print", moodTags: ["ominous", "minimal", "liminal"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 2, category: "Surreal / Hybrid", moodTags: ["ethereal", "cloud", "dreamlike"], reviewFlags: [] },
  { sourcePool: "new_meta_images", sourceSha256: "b1fbacd89915f78dcc3565d500b9d0df4aac74edf08a00be7829a22b219f5a83", category: "Minimal / Abstract", moodTags: ["vast", "architectural", "serene"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 13, category: "Minimal / Abstract", moodTags: ["electric", "cobalt", "minimal"], reviewFlags: [] },
  { sourcePool: "concept_reference_art", sourceSha256: "0a89082cf7ea6fdc8053405363a009b783578e9e191db0a72983a9ea7a727a03", category: "Graphic / Illustration / Print", moodTags: ["lunar", "distressed", "enigmatic"], reviewFlags: [] },
  { sourcePool: "new_meta_images", sourceSha256: "890f397c8d4f3ee5bccb90dc0b9eb8090552f29d22e25fb33774e016a18361f0", category: "Surreal / Hybrid", moodTags: ["luminous", "tranquil", "celestial"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 23, category: "Surreal / Hybrid", moodTags: ["crimson", "grain", "cosmic"], reviewFlags: [] },
  { sourcePool: "new_meta_images", sourceSha256: "33adf63fdc4cff78989d3762fca982ebcdb2b4c37b0d226d623a00f807e0ac4f", category: "Graphic / Illustration / Print", moodTags: ["graphic", "cosmic", "weathered"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 70, category: "Material / Sculptural / Organic", moodTags: ["bioluminescent", "abyssal", "organic"], reviewFlags: [] },
  { sourcePool: "concept_reference_art", sourceSha256: "18cbf168a4cb315e911bfda723ba5e2be0012623b58e5ba2d8946e59c7b58ab6", category: "Graphic / Illustration / Print", moodTags: ["mechanical", "mythic", "precise"], reviewFlags: ["generic-robot-form-review"] },
  { sourcePool: "meta_updated_images", sourceSha256: "6ecb2b7f031cdd95453f7fd5c5888e60414ddd2e6057e8b4faa2589fe41094ce", category: "Graphic / Illustration / Print", moodTags: ["feral", "botanical", "high-contrast"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 56, category: "Graphic / Illustration / Print", moodTags: ["vibrant", "risograph", "surreal"], reviewFlags: [] },
  { sourcePool: "concept_reference_art", sourceSha256: "9fc168e232a06e37ad417a5d253748b7f4e3376a7e4a8a23a9fc0af6cb3d4dd0", category: "Surreal / Hybrid", moodTags: ["stormy", "delicate", "whimsical"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 11, category: "Photography / Cinematic / Editorial", moodTags: ["luminous", "nocturnal", "abyssal"], reviewFlags: [] },
  { sourcePool: "new_meta_images", sourceSha256: "f4f72512dd71fff29a9f61068dc27c76453cf5476ed90decd051e75c6e27b4e5", category: "Surreal / Hybrid", moodTags: ["subterranean", "luminous", "cinematic"], reviewFlags: [] },
  { sourcePool: "concept_reference_art", sourceSha256: "dac19e8cc31eb086722ae26f73fa5f4d26dbc76ccbf63f1351817c21c6310436", category: "Graphic / Illustration / Print", moodTags: ["volatile", "graphic", "brooding"], reviewFlags: [] },
  { sourcePool: "new_meta_images", sourceSha256: "9423d95f6320303cb2c4056b8f50733c35bdad57f7a7cfe75949c91d8d4c3ba0", category: "Painterly / Illustrative", moodTags: ["glacial", "quiet", "otherworldly"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 37, category: "Graphic / Illustration / Print", moodTags: ["graphic", "angular", "urban"], reviewFlags: [] },
  { sourcePool: "concept_reference_art", sourceSha256: "bd41353a5408921c7d58f6edc290fff1055449efaf0809ad554330ded0d2cae9", category: "Graphic / Illustration / Print", moodTags: ["urban", "abstract", "reflective"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 123, category: "Material / Sculptural / Organic", moodTags: ["botanical", "ornate", "surreal"], reviewFlags: [] },
  { sourcePool: "new_meta_images", sourceSha256: "67b7593dec53d1f531d4b002098cfc394b9de61f93ddc5c9ae25ce74a1150a6f", category: "Surreal / Hybrid", moodTags: ["monumental", "desert", "speculative"], reviewFlags: [] },
  { sourcePool: "concept_reference_art", sourceSha256: "9401682d689b745117c14a6166ff0147431853476edebf00920065cc200a9e6b", category: "Surreal / Hybrid", moodTags: ["cosmic", "poignant", "still-life"], reviewFlags: [] },

  { sourcePool: "new_meta_images", sourceSha256: "07bdf5aba1e72db9acd78836ef8489fb96b5e4c656ccf931ecf8dc421da2474a", category: "Surreal / Hybrid", moodTags: ["emerald", "monumental", "enigmatic"], reviewFlags: [] },
  { sourcePool: "new_meta_images", sourceSha256: "57df7043f88ee4abbdeb47448298410728fb7645781f50de3a5d7da1a6bf40c8", category: "Painterly / Illustrative", moodTags: ["regal", "verdant", "mythic"], reviewFlags: [] },
  { sourcePool: "new_meta_images", sourceSha256: "359bd0a10815d29b69f5fb017bf8ef70aa9418c0b58638c832cc0594d00fb2aa", category: "Surreal / Hybrid", moodTags: ["playful", "mechanical", "sunlit"], reviewFlags: [] },
  { sourcePool: "new_meta_images", sourceSha256: "d1ca9ed8d6c3f8f8337ba22eae8ce1d9752cf1497d5fc45224ceaf457f16d2cf", category: "Graphic / Illustration / Print", moodTags: ["celestial", "contemplative", "symbolic"], reviewFlags: [] },
  { sourcePool: "new_meta_images", sourceSha256: "8fe11ce5bcbed92880b1eaec4696f4d55e6d57b460146dfdeba033a3dec6230c", category: "Graphic / Illustration / Print", moodTags: ["archival", "mysterious", "solitary"], reviewFlags: [] },
  { sourcePool: "new_meta_images", sourceSha256: "5e8537a9e84a63c445769539dec7cc83cd3b9d82111c9e613568a5b94330870b", category: "Graphic / Illustration / Print", moodTags: ["whimsical", "scholarly", "warm"], reviewFlags: [] },
  { sourcePool: "meta_updated_images", sourceSha256: "4cea1a7c1f01fae57e07cc8be06a04edf3e40df92fe08efdf63d7b941101571e", category: "Graphic / Illustration / Print", moodTags: ["urban", "melancholic", "quiet"], reviewFlags: [] },

  { sourcePool: "concept_reference_art", sourceSha256: "833e2718e7baccc724754dbea0b9968625cecb49e813416a3a3ab5775ada93bf", category: "Graphic / Illustration / Print", moodTags: ["urban", "absurd", "playful"], reviewFlags: [] },
  { sourcePool: "concept_reference_art", sourceSha256: "a22e035c417e6e774d51180bc8517cb33094c32982728b44e535c8ff7b72d373", category: "Graphic / Illustration / Print", moodTags: ["deadpan", "surreal", "editorial"], reviewFlags: [] },
  { sourcePool: "concept_reference_art", sourceSha256: "0b001dd20786fa1c45c7411eb9454b3e5fdf19d7302ecb2a4cdad5b46f0e4f25", category: "Graphic / Illustration / Print", moodTags: ["retro", "playful", "cosmic"], reviewFlags: [] },
  { sourcePool: "concept_reference_art", sourceSha256: "923c75d60f779ba3ed308ccb3a8f7e0d5228a29b5627fd6046b1a73edcbca81f", category: "Graphic / Illustration / Print", moodTags: ["visceral", "surreal", "dark"], reviewFlags: ["body-horror-content-review"] },
  { sourcePool: "concept_reference_art", sourceSha256: "331aa663dfd5ef752ceeaa509ccf3e4027fd183d8e53bf5c708732137139a36d", category: "Graphic / Illustration / Print", moodTags: ["extinct", "cosmic", "somber"], reviewFlags: ["animal-remains-content-review"] },

  { sourcePool: "generated_images", sourceOrdinal: 1, category: "Minimal / Abstract", moodTags: ["ethereal", "muted", "minimal"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 3, category: "Minimal / Abstract", moodTags: ["minimal", "verdant", "surreal"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 4, category: "Minimal / Abstract", moodTags: ["ethereal", "kinetic", "minimal"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 5, category: "Photography / Cinematic / Editorial", moodTags: ["cinematic", "noir", "realist"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 8, category: "Photography / Cinematic / Editorial", moodTags: ["prismatic", "nocturnal", "dreamlike"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 9, category: "Photography / Cinematic / Editorial", moodTags: ["spectral", "indigo", "noir"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 10, category: "Photography / Cinematic / Editorial", moodTags: ["gritty", "spectral", "noir"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 12, category: "Photography / Cinematic / Editorial", moodTags: ["ethereal", "motion", "noir"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 16, category: "Photography / Cinematic / Editorial", moodTags: ["cinematic", "urban", "kinetic"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 17, category: "Photography / Cinematic / Editorial", moodTags: ["nocturnal", "monochrome", "noir"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 19, category: "Surreal / Hybrid", moodTags: ["ethereal", "twilight", "surreal"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 20, category: "Digital / Computational", moodTags: ["monochrome", "glitch", "abstract"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 21, category: "Photography / Cinematic / Editorial", moodTags: ["atmospheric", "cinematic", "twilight"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 22, category: "Graphic / Illustration / Print", moodTags: ["graphic", "surreal", "minimal"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 24, category: "Photography / Cinematic / Editorial", moodTags: ["ethereal", "nocturnal", "minimal"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 26, category: "Minimal / Abstract", moodTags: ["kinetic", "ghostly", "minimal"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 27, category: "Material / Sculptural / Organic", moodTags: ["velvet", "moss", "surreal"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 28, category: "Digital / Computational", moodTags: ["corrupted", "monochrome", "brutalist"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 30, category: "Photography / Cinematic / Editorial", moodTags: ["luminous", "coastal", "tactile"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 31, category: "Photography / Cinematic / Editorial", moodTags: ["ethereal", "noir", "abstract"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 32, category: "Photography / Cinematic / Editorial", moodTags: ["nocturnal", "ethereal", "cyanotype"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 36, category: "Photography / Cinematic / Editorial", moodTags: ["spectral", "cobalt", "kinetic"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 38, category: "Material / Sculptural / Organic", moodTags: ["tactile", "organic", "opulent"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 44, category: "Digital / Computational", moodTags: ["corrupted", "digital", "dreamlike"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 46, category: "Graphic / Illustration / Print", moodTags: ["gritty", "graphic", "macabre"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 48, category: "Surreal / Hybrid", moodTags: ["saturated", "surreal", "pop"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 49, category: "Photography / Cinematic / Editorial", moodTags: ["nocturnal", "cyanotype", "dreamlike"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 50, category: "Digital / Computational", moodTags: ["gothic", "wild", "simulated"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 51, category: "Photography / Cinematic / Editorial", moodTags: ["nocturnal", "cobalt", "noir"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 55, category: "Photography / Cinematic / Editorial", moodTags: ["amber", "noir", "kinetic"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 63, category: "Photography / Cinematic / Editorial", moodTags: ["monochromatic", "cobalt", "noir"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 64, category: "Surreal / Hybrid", moodTags: ["crimson", "mystic", "surreal"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 65, category: "Graphic / Illustration / Print", moodTags: ["graphic", "kinetic", "surreal"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 68, category: "Minimal / Abstract", moodTags: ["textured", "geometric", "minimal"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 72, category: "Painterly / Illustrative", moodTags: ["luminous", "cosmic", "folkloric"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 74, category: "Painterly / Illustrative", moodTags: ["luminous", "ethereal", "pastel"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 77, category: "Digital / Computational", moodTags: ["fauvist", "glitch", "vibrant"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 78, category: "Painterly / Illustrative", moodTags: ["ethereal", "painterly", "botanical"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 81, category: "Photography / Cinematic / Editorial", moodTags: ["celestial", "nocturnal", "solitary"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 82, category: "Painterly / Illustrative", moodTags: ["serene", "pastel", "surreal"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 83, category: "Surreal / Hybrid", moodTags: ["melancholic", "forest", "solitary"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 84, category: "Photography / Cinematic / Editorial", moodTags: ["luminous", "nocturnal", "dreamlike"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 87, category: "Photography / Cinematic / Editorial", moodTags: ["bioluminescent", "cobalt", "noir"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 91, category: "Graphic / Illustration / Print", moodTags: ["monochrome", "gothic", "print"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 93, category: "Mixed Media / Collage", moodTags: ["retro", "cosmic", "collage"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 95, category: "Painterly / Illustrative", moodTags: ["ethereal", "pastel", "surreal"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 100, category: "Graphic / Illustration / Print", moodTags: ["nocturnal", "woodblock", "noir"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 103, category: "Graphic / Illustration / Print", moodTags: ["bold", "graphic", "neon"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 104, category: "Photography / Cinematic / Editorial", moodTags: ["luminous", "spectral", "hazy"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 106, category: "Photography / Cinematic / Editorial", moodTags: ["spectral", "monochrome", "noir"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 107, category: "Photography / Cinematic / Editorial", moodTags: ["cinematic", "noir", "minimal"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 109, category: "Surreal / Hybrid", moodTags: ["retro", "cosmic", "surreal"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 112, category: "Photography / Cinematic / Editorial", moodTags: ["analog", "desert", "surreal"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 66, category: "Photography / Cinematic / Editorial", moodTags: ["cinematic", "macro", "tactile"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 110, category: "Photography / Cinematic / Editorial", moodTags: ["crimson", "cinematic", "minimal"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 6, category: "Graphic / Illustration / Print", moodTags: ["nostalgic", "folk", "storybook"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 18, category: "Photography / Cinematic / Editorial", moodTags: ["nostalgic", "analog", "introspective"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 33, category: "Photography / Cinematic / Editorial", moodTags: ["cinematic", "transit", "melancholic"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 47, category: "Photography / Cinematic / Editorial", moodTags: ["cozy", "cinematic", "noir"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 79, category: "Digital / Computational", moodTags: ["nostalgic", "twilight", "pixel"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 94, category: "Graphic / Illustration / Print", moodTags: ["dark", "whimsical", "surreal"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 118, category: "Photography / Cinematic / Editorial", moodTags: ["amber", "minimal", "noir"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 119, category: "Photography / Cinematic / Editorial", moodTags: ["minimal", "noir", "chiaroscuro"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 129, category: "Photography / Cinematic / Editorial", moodTags: ["crimson", "noir", "minimal"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 130, category: "Surreal / Hybrid", moodTags: ["monochromatic", "verdant", "surreal"], reviewFlags: [] },
];

const legacyRetainedMetaSelection = previousLaunchSelection.filter(
  ({ sourcePool, sourceSha256 }) =>
    (sourcePool === "new_meta_images" || sourcePool === "meta_updated_images") &&
    sourceSha256 !== "57df7043f88ee4abbdeb47448298410728fb7645781f50de3a5d7da1a6bf40c8" &&
    sourceSha256 !== "4cea1a7c1f01fae57e07cc8be06a04edf3e40df92fe08efdf63d7b941101571e",
);

const retainedGeneratedOrdinals = new Set([
  13, 20, 22, 26, 27, 37, 44, 48, 56, 65, 68, 72, 74, 78, 91, 98, 103, 123,
]);
const legacyRetainedGeneratedSelection = previousLaunchSelection.filter(
  ({ sourcePool, sourceOrdinal }) =>
    sourcePool === "generated_images" &&
    sourceOrdinal !== undefined &&
    retainedGeneratedOrdinals.has(sourceOrdinal),
);
*/

// The 92 launch slots that survived the 2026-08-14 owner review, in their
// original relative order. The eight thinned near-duplicate identities are
// gone from source entirely and live only in git history and the
// catalog/excluded-candidates.json audit record.
const retainedLaunchSelection: readonly LaunchSelection[] = [
  ...conceptLaunchSelection,
  ...retainedMetaSelection,
  ...retainedGeneratedSelection,
  { sourcePool: "generated_images", sourceOrdinal: 38, category: "Material / Sculptural / Organic", moodTags: ["tactile", "organic", "opulent"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 46, category: "Graphic / Illustration / Print", moodTags: ["gritty", "graphic", "macabre"], reviewFlags: [] },
  { sourcePool: "generated_images", sourceOrdinal: 98, category: "Graphic / Illustration / Print", moodTags: ["bold", "pop", "surreal"], reviewFlags: [] },
];

export const REGENERATED_ORIGINAL_REVIEW_FLAGS: readonly string[] = [
  "regenerated_original_reference_led",
  "no_obvious_logo_text_watermark_likeness_or_protected_character_in_visual_review",
];

/**
 * Owner-directed style-cluster thinning, 2026-08-14: near-duplicate style
 * clusters were capped at 2–3 works and the excess was replaced by these
 * reference-led regenerated originals. `position` is the 1-based launch slot
 * of the work each one replaces, so the approved price ladder and the 50/50
 * exclusive/repeatable split are preserved exactly.
 */
export const regeneratedOriginalReplacements: readonly {
  position: number;
  selection: LaunchSelection;
}[] = [
  { position: 4, selection: { sourcePool: "regenerated_originals", sourceSha256: "640611737599c4e65057236449c90d9b06de1b41f15561822e40dba6d780da82", category: "Painterly / Illustrative", moodTags: ["solemn", "monumental", "nocturnal"], reviewFlags: REGENERATED_ORIGINAL_REVIEW_FLAGS, referenceSeries: "gothic_surrealism" } },
  { position: 16, selection: { sourcePool: "regenerated_originals", sourceSha256: "0e8024c6fdcdda1f56015bfa316ee3abb0310a9f40c6513e5f3ac767129c5617", category: "Material / Sculptural / Organic", moodTags: ["ritual", "weathered", "arcane"], reviewFlags: REGENERATED_ORIGINAL_REVIEW_FLAGS, referenceSeries: "gothic_surrealism" } },
  { position: 21, selection: { sourcePool: "regenerated_originals", sourceSha256: "c2526ee8c0e65eb1f0ceca1dc225ff5086130f6503862901b645eeda77889a4d", category: "Painterly / Illustrative", moodTags: ["austere", "haunting", "sacred"], reviewFlags: REGENERATED_ORIGINAL_REVIEW_FLAGS, referenceSeries: "gothic_surrealism" } },
  { position: 47, selection: { sourcePool: "regenerated_originals", sourceSha256: "944f68ea1dc73a7d1bbee7ee2257489b5911ca457f5c4bb1982bcde62b803701", category: "Surreal / Hybrid", moodTags: ["luminous", "vast", "elegiac"], reviewFlags: REGENERATED_ORIGINAL_REVIEW_FLAGS, referenceSeries: "gothic_surrealism" } },
  { position: 48, selection: { sourcePool: "regenerated_originals", sourceSha256: "23b477b5f92cded31ee6de8c91a0d627a404758c9297d9a592a894ddcfb81ff0", category: "Painterly / Illustrative", moodTags: ["meditative", "radiant", "devotional"], reviewFlags: REGENERATED_ORIGINAL_REVIEW_FLAGS, referenceSeries: "modern_surrealism" } },
  { position: 58, selection: { sourcePool: "regenerated_originals", sourceSha256: "d15a6bd3bd9de3ac4c3885664e02bcd91352591acba84da8b5b3147f777491ee", category: "Surreal / Hybrid", moodTags: ["serene", "monumental", "wandering"], reviewFlags: REGENERATED_ORIGINAL_REVIEW_FLAGS, referenceSeries: "modern_surrealism" } },
  { position: 93, selection: { sourcePool: "regenerated_originals", sourceSha256: "983524c609fb012f4e7b7b9c3bde5fd39da41006cdfe37cfd1f9b829d77405a5", category: "Painterly / Illustrative", moodTags: ["luminous", "gentle", "otherworldly"], reviewFlags: REGENERATED_ORIGINAL_REVIEW_FLAGS, referenceSeries: "modern_surrealism" } },
  { position: 99, selection: { sourcePool: "regenerated_originals", sourceSha256: "595082f3d921e6afd44f808a23cf2947a1e27587ebe56d9bb0d40720a37a6597", category: "Surreal / Hybrid", moodTags: ["playful", "folkloric", "vivid"], reviewFlags: REGENERATED_ORIGINAL_REVIEW_FLAGS, referenceSeries: "modern_surrealism" } },
];

/**
 * Restores replaced works to the exact launch slots they inherited. Ascending
 * insertion into the retained order reproduces every original position, so no
 * surviving work is renumbered by a swap.
 */
function withReplacements(
  retained: readonly LaunchSelection[],
  replacements: readonly { position: number; selection: LaunchSelection }[],
): readonly LaunchSelection[] {
  const composed = [...retained];
  const ordered = [...replacements].sort((left, right) => left.position - right.position);
  for (const { position, selection } of ordered) {
    if (!Number.isSafeInteger(position) || position < 1 || position > composed.length + 1) {
      throw new Error(`Replacement position ${position} is outside the launch selection.`);
    }
    composed.splice(position - 1, 0, selection);
  }
  return composed;
}

export const launchSelection: readonly LaunchSelection[] = withReplacements(
  retainedLaunchSelection,
  regeneratedOriginalReplacements,
);

// Keep rejected source labels out of the repository as readable copy too.
const bannedBrandPattern = new RegExp(
  String.raw`\b\x73\x65\x72\x67\x65\x79(?:\s*\/\s*\x65\x64\x69\x74\x69\x6f\x6e\x73)?\b|\b\x73\x65\x72\x67\x65\x79\s+\x65\x64\x69\x74\x69\x6f\x6e\x73\b`,
  "i",
);

export function containsLegacyBranding(value: unknown): boolean {
  return bannedBrandPattern.test(JSON.stringify(value));
}

export function normalizeStyleProfile<T extends Record<string, unknown>>(profile: T): T {
  const normalized = structuredClone(profile);
  if ("$schema" in normalized) {
    (normalized as Record<string, unknown>).$schema =
      "urn:artcovr:schemas:art-style-profile:3.0.0";
  }
  if (containsLegacyBranding(normalized)) {
    throw new Error("A legacy brand reference remains in normalized style metadata.");
  }
  return normalized;
}

export function buildSearchText(parts: {
  title: string;
  description: string;
  category: string;
  moodTags: readonly string[];
  keywords: readonly string[];
  palette: readonly string[];
  lighting?: string;
  mediumAndTexture?: string;
}): string {
  return [
    parts.title,
    parts.description,
    parts.category,
    ...parts.moodTags,
    ...parts.keywords,
    ...parts.palette,
    parts.lighting,
    parts.mediumAndTexture,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" | ");
}
