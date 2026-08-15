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
  { position: 4, selection: { sourcePool: "regenerated_originals", sourceSha256: "a2de27b6021422e09b8999fe305db3ca2d81b4b85a106d0c726104641fb67db8", category: "Painterly / Illustrative", moodTags: ["solemn", "monumental", "nocturnal"], reviewFlags: REGENERATED_ORIGINAL_REVIEW_FLAGS, referenceSeries: "gothic_surrealism" } },
  { position: 16, selection: { sourcePool: "regenerated_originals", sourceSha256: "e114dbcce2588ae7f0b896096c5932e0b44c37819a03869214dda28b74bb46fc", category: "Material / Sculptural / Organic", moodTags: ["ritual", "weathered", "arcane"], reviewFlags: REGENERATED_ORIGINAL_REVIEW_FLAGS, referenceSeries: "gothic_surrealism" } },
  { position: 21, selection: { sourcePool: "regenerated_originals", sourceSha256: "9acb2bf21ff1f0f4a95432e299f0296262745020e3513076493862e11259fde2", category: "Painterly / Illustrative", moodTags: ["austere", "haunting", "sacred"], reviewFlags: REGENERATED_ORIGINAL_REVIEW_FLAGS, referenceSeries: "gothic_surrealism" } },
  { position: 47, selection: { sourcePool: "regenerated_originals", sourceSha256: "944f68ea1dc73a7d1bbee7ee2257489b5911ca457f5c4bb1982bcde62b803701", category: "Surreal / Hybrid", moodTags: ["luminous", "vast", "elegiac"], reviewFlags: REGENERATED_ORIGINAL_REVIEW_FLAGS, referenceSeries: "gothic_surrealism" } },
  { position: 48, selection: { sourcePool: "regenerated_originals", sourceSha256: "d8689878945e344a2a6e0d7ac79eb574180a0ed7faac311ce82cc301656cbf98", category: "Painterly / Illustrative", moodTags: ["meditative", "radiant", "devotional"], reviewFlags: REGENERATED_ORIGINAL_REVIEW_FLAGS, referenceSeries: "modern_surrealism" } },
  { position: 58, selection: { sourcePool: "regenerated_originals", sourceSha256: "6abeb3afbb63aeb3706728d3332a501201904847245f89b315be2028530f7e82", category: "Surreal / Hybrid", moodTags: ["serene", "monumental", "wandering"], reviewFlags: REGENERATED_ORIGINAL_REVIEW_FLAGS, referenceSeries: "modern_surrealism" } },
  { position: 93, selection: { sourcePool: "regenerated_originals", sourceSha256: "a50373a194fc24e48d32690cc13c65ba4952d628966b61f8a119e7d0440b3d55", category: "Painterly / Illustrative", moodTags: ["luminous", "gentle", "otherworldly"], reviewFlags: REGENERATED_ORIGINAL_REVIEW_FLAGS, referenceSeries: "modern_surrealism" } },
  { position: 99, selection: { sourcePool: "regenerated_originals", sourceSha256: "a75e86bdbba9d20ba692f79e0b511b3d83c25c3dc0f9127783bccc42693d7abd", category: "Surreal / Hybrid", moodTags: ["playful", "folkloric", "vivid"], reviewFlags: REGENERATED_ORIGINAL_REVIEW_FLAGS, referenceSeries: "modern_surrealism" } },
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

/**
 * Owner-approved review flags for the 2026-08-14 collection rescore. Every row
 * below was machine-ranked against a full sweep of the source collection and
 * then passed an independent visual gate; rights remain unconfirmed.
 */
export const RESCORE_2026_08_14_REVIEW_FLAGS: readonly string[] = [
  "owner_direct_use_pool_source",
  "machine_scored_style_and_rarity_rank_2026-08-14",
  "independent_visual_gate_passed_no_visible_text_logo_watermark_likeness_child_nudity_or_protected_character",
  "commercial_rights_unconfirmed",
  "owner_approval_required",
];

/** The pre-rescore composition, retained so slots 1-17 stay byte-identical. */
const legacyLaunchSelection: readonly LaunchSelection[] = withReplacements(
  retainedLaunchSelection,
  regeneratedOriginalReplacements,
);

/**
 * Launch slots 18-100, in position order. Selected 2026-08-14 from a
 * 294,036-image scored sweep; see E:\ART_COLLECTION\.artcovr-scoring.
 */
const rescoreLaunchSelection: readonly LaunchSelection[] = [
  { sourcePool: "concept_reference_art", sourceSha256: "a4aef1c3b58cb44a8a8d77463f406c3e6f4bf29df17286ad9c9c2be9f0bb1c10", category: "Graphic / Illustration / Print", moodTags: ["wry", "domestic", "uncanny"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  18  pressed-into-smoke
  { sourcePool: "generated_images", sourceSha256: "b7ad04aca058a52a96449feaec1bdde02bdeb31906eb79cbded547028241fcf8", category: "Surreal / Hybrid", moodTags: ["cold", "alien", "luminous"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  19  abyssal-circuitry
  { sourcePool: "concept_reference_art", sourceSha256: "0825f876a115e55a582174c7bfb2958fc16acc678b048bb00c90661fc9038787", category: "Surreal / Hybrid", moodTags: ["tender", "captive", "anatomical"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  20  kept-heart
  { sourcePool: "concept_reference_art", sourceSha256: "4861b9c5a2db0f6d6e854ce7c7b0a6470d7f19247f4122efc9cbcccc09b41fad", category: "Material / Sculptural / Organic", moodTags: ["inert", "weathered", "industrial"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  21  ballast
  { sourcePool: "concept_reference_art", sourceSha256: "51b607c7d741f457970dd8cc05b6f93d79106bb79b8220e482ce1c94d4e3f8b9", category: "Graphic / Illustration / Print", moodTags: ["domestic", "abundant", "graphic"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  22  second-helping
  { sourcePool: "new_meta_images", sourceSha256: "e05a5161ec3019411ae5b576ee8c562fcb9212545fbc1012ffdaa63d8b5d45fb", category: "Graphic / Illustration / Print", moodTags: ["obsolete", "solitary", "civic"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  23  line-discontinued
  { sourcePool: "new_meta_images", sourceSha256: "6300243b12de93e8b5684405c36c5b5110ea264ded278981a59377fce57f9019", category: "Painterly / Illustrative", moodTags: ["absurd", "kinetic", "bandaged"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  24  wrapped-waltz
  { sourcePool: "concept_reference_art", sourceSha256: "406f22ed1f6d27ae50bb7996c86f9ff9063a20db316e8dd5b78a8629d71b726a", category: "Graphic / Illustration / Print", moodTags: ["mordant", "bureaucratic", "skeletal"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  25  estate-of-paper
  { sourcePool: "concept_reference_art", sourceSha256: "01ecba3251649629ae801e5d513256cddc0e32595d48cda9e642807c57e91efe", category: "Painterly / Illustrative", moodTags: ["nocturnal", "lonely", "urban"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  26  open-all-night
  { sourcePool: "generated_images", sourceSha256: "35220b4c6a606732d89a81e278f66981472c460450081064e29c41ce2305a9ee", category: "Material / Sculptural / Organic", moodTags: ["botanical", "lunar", "archival"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  27  fern-almanac
  { sourcePool: "concept_reference_art", sourceSha256: "af21048ff5d55442f7ffc3936a6f28e109aae5c614f86ea1bc83ca1fd59125af", category: "Graphic / Illustration / Print", moodTags: ["patient", "communal", "wry"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  28  the-waiting-row
  { sourcePool: "new_meta_images", sourceSha256: "a020be38cec4584030b2960296e21e4c727fa617a9865f53b8a09966a30a776b", category: "Surreal / Hybrid", moodTags: ["strategic", "weightless", "still"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  29  endgame-afloat
  { sourcePool: "new_meta_images", sourceSha256: "f0e906ca4b91660395567a37175b7b3b6a690c3544e3c599c5472f4fe6f7416f", category: "Material / Sculptural / Organic", moodTags: ["monumental", "eroding", "serene"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  30  slow-collapse
  { sourcePool: "generated_images", sourceSha256: "b8d6828fc870825b296f76b7d55a08eb715b04be929a5d249a71765a839ad5e2", category: "Surreal / Hybrid", moodTags: ["fractured", "ominous", "reflective"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  31  shatter-count
  { sourcePool: "concept_reference_art", sourceSha256: "11dc661ab7fe1dfbbde39e42ba53953389e93e093c6ade0d704a4ba86fd00de5", category: "Graphic / Illustration / Print", moodTags: ["sinister", "playful", "worn"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  32  baggage-grin
  { sourcePool: "generated_images", sourceSha256: "5de0f64e80aa1a6494261e5e8895b7573c34ad0583496c8a331e7c341a634bc0", category: "Minimal / Abstract", moodTags: ["minimal", "taut", "singular"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  33  one-knot
  { sourcePool: "concept_reference_art", sourceSha256: "b1d61ea31744a13d9404677368baba1c9e48956640eb3f96abdc3f37d2a1f1cc", category: "Surreal / Hybrid", moodTags: ["swallowing", "dark", "fluid"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  34  undertow-drain
  { sourcePool: "concept_reference_art", sourceSha256: "f1a070c99db2dffcc5494bd4c2a1322ed0dbf4d672b806d9990258344490d430", category: "Surreal / Hybrid", moodTags: ["isolated", "vast", "wistful"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  35  distant-weather
  { sourcePool: "concept_reference_art", sourceSha256: "74eef8018780eb6b18654ed035e53a746869ba94ecb7f057a2e59acf72be32ae", category: "Minimal / Abstract", moodTags: ["austere", "still", "geometric"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  36  chair-noon
  { sourcePool: "concept_reference_art", sourceSha256: "e68a1e2dd34ef50c458b2db83d5b9f2f6ee1b776b14de230f97af5e572d5f327", category: "Graphic / Illustration / Print", moodTags: ["tender", "domestic", "hopeful"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  37  care-instructions
  { sourcePool: "generated_images", sourceSha256: "4f6f200626824872378e1af753de9092e1c7252bb4488a44a06b572599d986dc", category: "Painterly / Illustrative", moodTags: ["romantic", "nocturnal", "adrift"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  38  night-passage
  { sourcePool: "generated_images", sourceSha256: "0b9c4f8a5cc2a7fd422a1d2748f607d5945818eb1846542fba570e4365b8f58c", category: "Surreal / Hybrid", moodTags: ["churning", "verdant", "alien"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  39  green-vortex
  { sourcePool: "concept_reference_art", sourceSha256: "fe75472de82aeac16c0c675cc45a3323c3f67e851f8888c02a4b489b3863a954", category: "Graphic / Illustration / Print", moodTags: ["mundane", "kinetic", "halftone"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  40  spin-cycle
  { sourcePool: "concept_reference_art", sourceSha256: "1fd1ce08f5150d003168d0c22a360d54d7537a2eb60dcbb1c0ee5ede1ba4570b", category: "Graphic / Illustration / Print", moodTags: ["civic", "worn", "mechanical"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  41  meter-reading
  { sourcePool: "concept_reference_art", sourceSha256: "dc444329bb5913c4bac3b838492226b456eaeee4589a5d14bddf6a4bac49bd2a", category: "Painterly / Illustrative", moodTags: ["brooding", "private", "smoky"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  42  bad-news-slowly
  { sourcePool: "new_meta_images", sourceSha256: "c6e300c6a2e0c6401a8c46dfb3e4775d726f35a6db6f2b48c7acce26a2250156", category: "Graphic / Illustration / Print", moodTags: ["heraldic", "engraved", "fierce"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  43  three-roars
  { sourcePool: "concept_reference_art", sourceSha256: "a41243db6eaf5197167ed076e0e313b01edab263c3088dfbce476fde6fcba603", category: "Painterly / Illustrative", moodTags: ["monumental", "layered", "civic"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  44  spire-density
  { sourcePool: "concept_reference_art", sourceSha256: "e7116b59106aae251776a131d36c86bcbc90764a1410b03062c047adf2d880ae", category: "Surreal / Hybrid", moodTags: ["corporate", "entangled", "absurd"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  45  board-of-roots
  { sourcePool: "new_meta_images", sourceSha256: "ba2cd9f09a59d253547e3ced5a9cda3df430a1b31d1f1fbfda2a59c95ecdc198", category: "Material / Sculptural / Organic", moodTags: ["tactile", "repetitive", "mineral"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  46  seed-ledger
  { sourcePool: "new_meta_images", sourceSha256: "20930825caf52d4710d2cbe77d59a53c7bed5afef0a90e4a17d61c51599d0a95", category: "Surreal / Hybrid", moodTags: ["strange", "gentle", "dreamlike"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  47  introductions
  { sourcePool: "new_meta_images", sourceSha256: "91a5d4cd22e57f92e0fee8fd93e88b1937e09a974d93072dc7519073a2f957d1", category: "Graphic / Illustration / Print", moodTags: ["feral", "sequential", "engraved"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  48  four-barks
  { sourcePool: "concept_reference_art", sourceSha256: "74d7b42e21a5adcfa3fe4d2171fb4309e8b9a70d6900f7684a9588c24b5f8e1e", category: "Graphic / Illustration / Print", moodTags: ["clinical", "violent", "quiet"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  49  ward-bloom
  { sourcePool: "concept_reference_art", sourceSha256: "69ab5ff47b2ce5ad2e413b716836f945889f8204a866f278d377bd28b47a78bc", category: "Minimal / Abstract", moodTags: ["minimal", "patient", "geometric"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  50  sit-with-it
  { sourcePool: "concept_reference_art", sourceSha256: "9d83e6126140cec03d992e892b956b3b4f602dfd312c7bb577ffe382c5780ab9", category: "Graphic / Illustration / Print", moodTags: ["surveilled", "wry", "dripping"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  51  watched-bleeding
  { sourcePool: "concept_reference_art", sourceSha256: "2a7e8de1e8c119df4b25d0b72a6405e7296e0c0e5bfb2416b8778eef741efe41", category: "Mixed Media / Collage", moodTags: ["bureaucratic", "layered", "chaotic"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  52  backlog
  { sourcePool: "concept_reference_art", sourceSha256: "73a2d38d35a1b927ab636449d898922b127a2f44ab3b4fa867bdf2a9482c1023", category: "Painterly / Illustrative", moodTags: ["insomniac", "dread", "still"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  53  small-red-light
  { sourcePool: "concept_reference_art", sourceSha256: "dac19e8cc31eb086722ae26f73fa5f4d26dbc76ccbf63f1351817c21c6310436", category: "Graphic / Illustration / Print", moodTags: ["violent", "absurd", "graphic"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  54  forecast-fire
  { sourcePool: "concept_reference_art", sourceSha256: "88e601ebbc3178070dcfa40721e00f0876750d4ef7417a60c6bccc8e726570ef", category: "Painterly / Illustrative", moodTags: ["wry", "burning", "domestic"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  55  domestic-combustion
  { sourcePool: "new_meta_images", sourceSha256: "09d72870073a5e143883038bd34f356089ea7f8489f780cbcd771d2bd4320985", category: "Graphic / Illustration / Print", moodTags: ["industrial", "precise", "archival"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  56  the-machine-that-prints-us
  { sourcePool: "generated_images", sourceSha256: "1aecac512099c480b7d54f402873a719d0f677cc453317c7d8f8be8bbdb889b7", category: "Painterly / Illustrative", moodTags: ["serene", "ceremonial", "pale"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  57  branch-offering
  { sourcePool: "new_meta_images", sourceSha256: "3043bea88c26bc21a16b279286125d187199d224bb60148a54ba3d7765adecf1", category: "Material / Sculptural / Organic", moodTags: ["absurd", "fragile", "tactile"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  58  vessel-dressed
  { sourcePool: "concept_reference_art", sourceSha256: "337bbcbb9041f5d5a2f175aa03904e008555b2edbf9b854ba2e8fb43c79be840", category: "Graphic / Illustration / Print", moodTags: ["domestic", "alarming", "clinical"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  59  cold-storage
  { sourcePool: "new_meta_images", sourceSha256: "15b7d2a7ae45440e348b5f140b83be9d4ed16a2efbc9f6e0aab58be588b7e5d3", category: "Surreal / Hybrid", moodTags: ["ominous", "marching", "absurd"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  60  the-long-walk-home
  { sourcePool: "concept_reference_art", sourceSha256: "0b001dd20786fa1c45c7411eb9454b3e5fdf19d7302ecb2a4cdad5b46f0e4f25", category: "Graphic / Illustration / Print", moodTags: ["appetite", "bold", "graphic"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  61  broth-pop
  { sourcePool: "generated_images", sourceSha256: "13e294842fc075b565344e9228e61c316a5df6bbeeaa43a8a2a6c4fe804933c4", category: "Surreal / Hybrid", moodTags: ["numinous", "aerial", "inviting"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  62  doorway-cumulus
  { sourcePool: "concept_reference_art", sourceSha256: "38907590d65d180488fc8ac75bbc8a7cfdf87c018e712a774d3f92f2695865d1", category: "Surreal / Hybrid", moodTags: ["uncanny", "ceremonial", "culinary"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  63  service-for-none
  { sourcePool: "new_meta_images", sourceSha256: "9b62281d378605ceb1c018cb55941f3d08561f6f0ca5b4454fbb3d3ec7503252", category: "Painterly / Illustrative", moodTags: ["ornate", "overgrown", "gilded"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  64  recital-overgrown
  { sourcePool: "concept_reference_art", sourceSha256: "86511f48a4ac2f6826924079b98564ffff3630d4e55ccbe65678c41bfa75b3c3", category: "Graphic / Illustration / Print", moodTags: ["domestic", "tempestuous", "wry"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  65  storm-steeped
  { sourcePool: "generated_images", sourceSha256: "45891424ab079d2ec6fc310f90c02b1d01b8e98b049958f616f1a8c123bb9f17", category: "Surreal / Hybrid", moodTags: ["aspirational", "absurd", "spare"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  66  threshold-above
  { sourcePool: "new_meta_images", sourceSha256: "919e3c872c65f8fe83ea90bccd37a1da7d6b378b480e263d8230c8b26533cbac", category: "Material / Sculptural / Organic", moodTags: ["draped", "empty", "sculptural"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  67  sitter-absent
  { sourcePool: "new_meta_images", sourceSha256: "fa87fbdcf07d99ff422a93031da7cf3ac31ee6e78f456c4c081d654bde53f340", category: "Painterly / Illustrative", moodTags: ["scholarly", "folkloric", "ornate"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  68  the-ledger-keeper
  { sourcePool: "concept_reference_art", sourceSha256: "3c217685ac14a49cbe536a80bc61e7f1c68e2f2647947951fcf5810428a34d31", category: "Graphic / Illustration / Print", moodTags: ["absent", "uniform", "muted"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  69  coats-without-us
  { sourcePool: "concept_reference_art", sourceSha256: "ed84f897f89acc36e1cfb2de1043f857b67e7d009225641b9f6bc04bdec1fccd", category: "Surreal / Hybrid", moodTags: ["surging", "ominous", "aquatic"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  70  tide-under-the-door
  { sourcePool: "concept_reference_art", sourceSha256: "f70e2d05de60c2df21e22b9f0db6f1d04c0e2f44a9c502ec13162f5603b2f1dc", category: "Surreal / Hybrid", moodTags: ["fragile", "luminous", "aquatic"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  71  birthday-submerged
  { sourcePool: "concept_reference_art", sourceSha256: "196ca0624f18f47ce5210a875a195722b7f834f400fbf3c15ea537b04c02e669", category: "Graphic / Illustration / Print", moodTags: ["nocturnal", "mechanical", "dreamlike"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  72  night-dispensary
  { sourcePool: "new_meta_images", sourceSha256: "dafe4ac7dc602bcd49ea43378087458f86efb74f6fcf92672e4be17dac7244da", category: "Painterly / Illustrative", moodTags: ["alien", "vast", "mineral"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  73  spire-field
  { sourcePool: "concept_reference_art", sourceSha256: "422e3da9339ff4c8d25447a47f19df03738896879c6ec08db1c821d230b669da", category: "Graphic / Illustration / Print", moodTags: ["nostalgic", "organic", "technical"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  74  analog-root-system
  { sourcePool: "concept_reference_art", sourceSha256: "d2b1bad0ca75dc6b317805a722e1b8a89ed785c9e7c33113c98c0a710d92a392", category: "Graphic / Illustration / Print", moodTags: ["turbulent", "domestic", "dark"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  75  bath-of-ink
  { sourcePool: "concept_reference_art", sourceSha256: "5beb8edb69497bb13f6ab418d68fdc30666bd9427a8f977ea411581d230612c8", category: "Graphic / Illustration / Print", moodTags: ["appetite", "violent", "graphic"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  76  bowl-and-blood-orange
  { sourcePool: "new_meta_images", sourceSha256: "605ba4ee3d2ee2ab8dd5e31c23e94e46677f0dbb2663f86e5f9f15cf98988577", category: "Painterly / Illustrative", moodTags: ["opulent", "layered", "ancient"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  77  gilt-reflections
  { sourcePool: "concept_reference_art", sourceSha256: "f7761d2eb3fa7704d8ea4ededce2e8cd35282d1162c2e3c5ab8593190d1f8c16", category: "Surreal / Hybrid", moodTags: ["absurd", "formal", "aquatic"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  78  dinner-guest
  { sourcePool: "new_meta_images", sourceSha256: "71b2d785a8821939d7bad8f869c7f6b74c6df227a16bab658e9931728ddfa00f", category: "Painterly / Illustrative", moodTags: ["receding", "serene", "uncanny"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  79  procession-of-swans
  { sourcePool: "concept_reference_art", sourceSha256: "5b374481524cf2878aece0528db5b55b93975c487c4e9ced728f4539f84bf5b3", category: "Graphic / Illustration / Print", moodTags: ["reverent", "mechanical", "iconic"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  80  saint-of-small-machines
  { sourcePool: "concept_reference_art", sourceSha256: "923c75d60f779ba3ed308ccb3a8f7e0d5228a29b5627fd6046b1a73edcbca81f", category: "Surreal / Hybrid", moodTags: ["devouring", "vertiginous", "dark"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  81  the-floor-opens
  { sourcePool: "concept_reference_art", sourceSha256: "fe656bad878235933f3e81da7cc6eb51223637f7442dd1e3e733d6264e37bd87", category: "Graphic / Illustration / Print", moodTags: ["conspiratorial", "repetitive", "muted"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  82  counting-room
  { sourcePool: "concept_reference_art", sourceSha256: "15dc5bdf61949f7a05b02a23937f98341ac9144fe4d0b77ccdda6cd293cda502", category: "Graphic / Illustration / Print", moodTags: ["surveilled", "bleeding", "wry"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  83  red-witness
  { sourcePool: "concept_reference_art", sourceSha256: "c6acbf0642b050e20448a056e7482a3e57dd36c05772e3922c69b321e83120d1", category: "Surreal / Hybrid", moodTags: ["ironic", "ceremonial", "layered"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  84  wedding-jurisdiction
  { sourcePool: "concept_reference_art", sourceSha256: "dbbf873c6dbd17155d02db3ef4056f65652d8536255dd9a4078ca3210292683b", category: "Mixed Media / Collage", moodTags: ["fragmented", "constructed", "bold"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  85  assembly-partial
  { sourcePool: "new_meta_images", sourceSha256: "47e67393b1e125a045789c5b3e5dcb9815bdc241824cabc13ad54cf6ff471274", category: "Surreal / Hybrid", moodTags: ["melting", "comic", "arid"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  86  yellow-slump
  { sourcePool: "concept_reference_art", sourceSha256: "5b08be6fc14bfbfb70f69a66a65b0c42519181b7b763c6d94b39eddc0b6c9001", category: "Graphic / Illustration / Print", moodTags: ["inverted", "smoky", "wry"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  87  umbrella-reversed
  { sourcePool: "concept_reference_art", sourceSha256: "331aa663dfd5ef752ceeaa509ccf3e4027fd183d8e53bf5c708732137139a36d", category: "Graphic / Illustration / Print", moodTags: ["mortal", "graphic", "arid"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  88  two-skulls-two-suns
  { sourcePool: "concept_reference_art", sourceSha256: "4492eec8d4db144eebb066ff164fc404b191a9beddc4b94a1fda7b82117e3331", category: "Graphic / Illustration / Print", moodTags: ["absurd", "wired", "domestic"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  89  breakfast-circuitry
  { sourcePool: "concept_reference_art", sourceSha256: "84db519f9078ff347ed858e5aa1e1302495dd53c1b432e04e0aa8f8a1e4161ee", category: "Graphic / Illustration / Print", moodTags: ["grieving", "singular", "ink"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  90  one-wet-eye
  { sourcePool: "concept_reference_art", sourceSha256: "8c7ed40725786b5eb55b15ac2ea64568ebb65443d91a847360a57a5579e4f274", category: "Graphic / Illustration / Print", moodTags: ["greedy", "grotesque", "graphic"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  91  cost-of-smiling
  { sourcePool: "concept_reference_art", sourceSha256: "73863595b64eb4d41d684f56ab746631025bc3f64aa5ae1dd2f0a3503901521b", category: "Mixed Media / Collage", moodTags: ["contemplative", "smoky", "bold"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  92  exhale-red
  { sourcePool: "concept_reference_art", sourceSha256: "b753562340b438444f0bf4f889f6407d745d11c367207d3230cd68d5574605c2", category: "Graphic / Illustration / Print", moodTags: ["urban", "appetite", "reflective"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  93  city-in-the-steam
  { sourcePool: "concept_reference_art", sourceSha256: "a74f4807d5798e9360e58306911b46e521840b7d26c7c5a400755bb278da0a65", category: "Graphic / Illustration / Print", moodTags: ["absurd", "burning", "domestic"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  94  dinner-on-hold
  { sourcePool: "generated_images", sourceSha256: "c3aeff1c669a9c4df5e40dfc583af136cea401f19f87e7cccef32b4e10511b75", category: "Painterly / Illustrative", moodTags: ["theatrical", "mortal", "ornate"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  95  the-mirror-dances-back
  { sourcePool: "new_meta_images", sourceSha256: "6016a8ebb5d3f5a9f23d22294dc7fd62924c4a2169ab2ec38263441eeb2446e9", category: "Surreal / Hybrid", moodTags: ["mortal", "looming", "nocturnal"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  96  overhead-memento
  { sourcePool: "new_meta_images", sourceSha256: "a35f10c78389d4167866b910f2b4a5153e4a643ef1647007738ff2f244153b67", category: "Minimal / Abstract", moodTags: ["minimal", "solitary", "arid"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  97  one-tower-one-shadow
  { sourcePool: "concept_reference_art", sourceSha256: "58260ef3a72649a05bce38c145a6f6607bab1279bad48a5399930bbbb7dc12d8", category: "Surreal / Hybrid", moodTags: ["mundane", "cosmic", "wry"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  98  refuse-orbiting
  { sourcePool: "new_meta_images", sourceSha256: "726bae853a07de16600bf9fb7201e42e67fb0d525c4ba43c361475a7c2437518", category: "Mixed Media / Collage", moodTags: ["fragmented", "guiding", "layered"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  //  99  signal-head
  { sourcePool: "new_meta_images", sourceSha256: "c121d6e4e87e15a1a0aaa2a4f759243e81daf19d54ec864042e9386203cbc770", category: "Material / Sculptural / Organic", moodTags: ["severe", "mineral", "monumental"], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },  // 100  black-prism-peak
];

export const launchSelection: readonly LaunchSelection[] = [
  ...legacyLaunchSelection.slice(0, 17),
  ...rescoreLaunchSelection,
];

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
