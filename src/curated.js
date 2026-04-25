// Curated top collections per chain. The gallery curates — not an aggregator.
// PFPs/names will be fetched live via Alchemy/Magic Eden, but identifiers
// (contract addresses for ETH/Ape, ME symbols for Solana) are hand-picked.

export const ETHEREUM = [
  // ✨ Saints orbit + frens — the home crew
  { name: "Saints of LA — ETERNAL",     contract: "0x7cab6c0e4dc14b995901f5d672cdcc8469cc459d" },
  { name: "SteezyApeGang",              contract: "0x70789e18a75611a9516d6251d650d096740a9e07" },
  { name: "HMN5",                       contract: "0x32fc5bcabc1f78308be11754493c49116c0fa35f" },
  { name: "Good Vibes Club",            contract: "0xb8ea78fcacef50d41375e44e6814ebba36bb33c4" },
  { name: "z00tz Anchor Club",          contract: "0x270edbe355ba17f787503c372464ecbaf3ada61a" },
  // Blue chips
  { name: "CryptoPunks",                contract: "0xb47e3cd837ddf8e4c57f05d70ab865de6e193bbb" },
  { name: "Bored Ape Yacht Club",       contract: "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d" },
  { name: "Mutant Ape Yacht Club",      contract: "0x60e4d786628fea6478f785a6d7e704777c86a7c6" },
  { name: "Pudgy Penguins",             contract: "0xbd3531da5cf5857e7cfaa92426877b022e612cf8" },
  { name: "Lil Pudgys",                 contract: "0x524cab2ec69124574082676e6f654a18df49a048" },
  { name: "Azuki",                      contract: "0xed5af388653567af2f388e6224dc7c4b3241c544" },
  { name: "Azuki Elemental",            contract: "0xb6a37b5d14d502c3ab0ae6f3a0e058bc9517786e" },
  { name: "Doodles",                    contract: "0x8a90cab2b38dba80c64b7734e58ee1db38b8992e" },
  { name: "Milady Maker",               contract: "0x5af0d9827e0c53e4799bb226655a1de152a425a5" },
  { name: "Redacted Remilio Babies",    contract: "0xd3d9ddd0cf0a5f0bfb8f7fceae075df687eaebab" },
  { name: "Moonbirds",                  contract: "0x23581767a106ae21c074b2276d25e5c3e136a68b" },
  { name: "Clone X",                    contract: "0x49cf6f5d44e70224e2e23fdcdd2c053f30ada28b" },
  { name: "World of Women",             contract: "0xe785e82358879f061bc3dcac6f0444462d4b5330" },
  { name: "VeeFriends",                 contract: "0xa3aee8bce55beea1951ef834b99f3ac60d1abeeb" },
  { name: "Bored Ape Kennel Club",      contract: "0xba30e5f9bb24caa003e9f2f0497ad287fdf95623" },
  { name: "Beanz",                      contract: "0x306b1ea3ecdf94ab739f1910bbda052ed4a9f949" },
  { name: "Renga",                      contract: "0x394e3d3044fc89fcdd966d3cb35ac0b32b0cda91" },
  { name: "Nakamigos",                  contract: "0xd774557b647330c91bf44cfeab205095f7e6c367" },
  { name: "Memeland Captainz",          contract: "0x769272677fab02575e84945f03eca517acc544cc" },
  { name: "Cool Cats",                  contract: "0x1a92f7381b9f03921564a437210bb9396471050c" },
];

export const APECHAIN = [
  // NOTE: ApeChain is newer — a few of these are placeholder names. We'll
  // verify and tighten this list once the page lights up.
  { name: "Bored Ape Yacht Club",       contract: "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d" },
  { name: "Mutant Ape Yacht Club",      contract: "0x60e4d786628fea6478f785a6d7e704777c86a7c6" },
  { name: "Saints of LA",               contract: "0x0000000000000000000000000000000000000000" }, // TODO: real Saints contract on Ape
  { name: "Chumpz",                     contract: "0x0000000000000000000000000000000000000000" }, // TODO: real Chumpz contract on Ape
  { name: "Otherdeed Expanded",         contract: "0x0000000000000000000000000000000000000000" }, // TODO
  { name: "Gs on Ape",                  contract: "0x0000000000000000000000000000000000000000" }, // TODO
  { name: "ApeChain Genesis",           contract: "0x0000000000000000000000000000000000000000" }, // TODO
];

export const SOLANA = [
  // ME v2 uses "symbol" slugs, not contract addresses.
  { name: "Mad Lads",          symbol: "mad_lads" },
  { name: "DeGods",            symbol: "degods" },
  { name: "y00ts",             symbol: "y00ts" },
  { name: "SMB Gen2",          symbol: "solana_monkey_business" },
  { name: "Okay Bears",        symbol: "okay_bears" },
  { name: "Tensorians",        symbol: "tensorians" },
  { name: "Claynosaurz",       symbol: "claynosaurz" },
  { name: "Famous Fox Federation", symbol: "famous_fox_federation" },
  { name: "Aurory",            symbol: "aurory" },
  { name: "Degenerate Ape Academy", symbol: "degenerate_ape_academy" },
  { name: "ABC",               symbol: "abc" },
  { name: "Frogana",           symbol: "frogana" },
  { name: "Retardio Cousins",  symbol: "retardio_cousins" },
  { name: "The Heist",         symbol: "the_heist" },
  { name: "Quekz",             symbol: "quekz" },
  { name: "Solana Money Boys", symbol: "solana_money_boys" },
  { name: "Cets on Creck",     symbol: "cets_on_creck" },
  { name: "Critters Confederacy", symbol: "critters_confederacy" },
  { name: "Mindfolk",          symbol: "mindfolk_wood" },
  { name: "Boryoku Dragonz",   symbol: "boryoku_dragonz" },
  { name: "GalacticGeckoSG",   symbol: "galactic_gecko_space_garage" },
  { name: "Photofinish PHL",   symbol: "photo_finish_pfp" },
  { name: "Trippin Ape Tribe", symbol: "trippin_ape_tribe" },
  { name: "Pesky Penguins",    symbol: "pesky_penguins" },
  { name: "Bears Reloaded",    symbol: "bears_reloaded" },
];
