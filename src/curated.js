// Curated top collections per chain. The gallery curates — not an aggregator.
// PFPs/names will be fetched live via Alchemy/Magic Eden, but identifiers
// (contract addresses for ETH/Ape, ME symbols for Solana) are hand-picked.

export const ETHEREUM = [
  { name: "CryptoPunks",                contract: "0xb47e3cd837ddf8e4c57f05d70ab865de6e193bbb" },
  { name: "Bored Ape Yacht Club",       contract: "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d" },
  { name: "Mutant Ape Yacht Club",      contract: "0x60e4d786628fea6478f785a6d7e704777c86a7c6" },
  { name: "Pudgy Penguins",             contract: "0xbd3531da5cf5857e7cfaa92426877b022e612cf8" },
  { name: "Azuki",                      contract: "0xed5af388653567af2f388e6224dc7c4b3241c544" },
  { name: "Doodles",                    contract: "0x8a90cab2b38dba80c64b7734e58ee1db38b8992e" },
  { name: "Milady Maker",               contract: "0x5af0d9827e0c53e4799bb226655a1de152a425a5" },
  { name: "Cool Cats",                  contract: "0x1a92f7381b9f03921564a437210bb9396471050c" },
  { name: "Moonbirds",                  contract: "0x23581767a106ae21c074b2276d25e5c3e136a68b" },
  { name: "Clone X",                    contract: "0x49cf6f5d44e70224e2e23fdcdd2c053f30ada28b" },
  { name: "World of Women",             contract: "0xe785e82358879f061bc3dcac6f0444462d4b5330" },
  { name: "Otherdeed for Otherside",    contract: "0x34d85c9cdeb23fa97cb08333b511ac86e1c4e258" },
  { name: "VeeFriends",                 contract: "0xa3aee8bce55beea1951ef834b99f3ac60d1abeeb" },
  { name: "Bored Ape Kennel Club",      contract: "0xba30e5f9bb24caa003e9f2f0497ad287fdf95623" },
  { name: "Cryptoadz",                  contract: "0x1cb1a5e4c44ff5b3c5b4ea8a1c4a6f6e9e1a7d22" },
  { name: "Meebits",                    contract: "0x7bd29408f11d2bfc23c34f18275bbf23bb716bc7" },
  { name: "Wrapped Cryptopunks",        contract: "0xb7f7f6c52f2e2fdb1963eab30438024864c313f6" },
  { name: "RTFKT — MNLTH",              contract: "0x86825dfca7a6224cfbd2da48e85df2fc3aa7c4b1" },
  { name: "Goblintown",                 contract: "0xbce3781ae7ca1a5e050bd9c4c77369867ebc307e" },
  { name: "Lil Pudgys",                 contract: "0x524cab2ec69124574082676e6f654a18df49a048" },
  { name: "Beanz",                      contract: "0x306b1ea3ecdf94ab739f1910bbda052ed4a9f949" },
  { name: "Renga",                      contract: "0x394e3d3044fc89fcdd966d3cb35ac0b32b0cda91" },
  { name: "Nakamigos",                  contract: "0xd774557b647330c91bf44cfeab205095f7e6c367" },
  { name: "Memeland Captainz",          contract: "0x769272677fab02575e84945f03eca517acc544cc" },
  { name: "DeGods (ETH)",               contract: "0x8821bee2ba0df28761afff119d66390d594cd280" },
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
