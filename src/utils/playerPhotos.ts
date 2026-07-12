// Photos des joueurs — Wikipedia (récent) + TheSportsDB (fallback)
const PHOTOS: Record<string, string> = {
  'Lamine Yamal':         'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/Lamine_Yamal_a_Xina_%282025%29.png/330px-Lamine_Yamal_a_Xina_%282025%29.png',
  'Raphinha':             'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b4/Raphinha_Brazil_V_Morocco_13_June_2026-133_%28cropped%29.jpg/330px-Raphinha_Brazil_V_Morocco_13_June_2026-133_%28cropped%29.jpg',
  'Robert Lewandowski':   'https://r2.thesportsdb.com/images/media/player/thumb/1ogy3i1771254580.jpg',
  'Pedri':                'https://upload.wikimedia.org/wikipedia/commons/thumb/1/13/Pedri.jpg/330px-Pedri.jpg',
  'Gavi':                 'https://upload.wikimedia.org/wikipedia/commons/1/1e/Jugadors_pretemporada_pels_Estats_Units_%28cropped%292.jpg',
  'Jules Koundé':         'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ee/Jules_Kounde_France_v_Senegal_16_June_2026-449_%28cropped%29.jpg/330px-Jules_Kounde_France_v_Senegal_16_June_2026-449_%28cropped%29.jpg',
  'Pau Cubarsí':          'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/Pau_Cubars%C3%AD_%28cropped%29.jpg/330px-Pau_Cubars%C3%AD_%28cropped%29.jpg',
  'Frenkie de Jong':      'https://upload.wikimedia.org/wikipedia/commons/4/42/%D0%9C%D0%B0%D1%82%D1%87_%C2%AB%D0%94%D0%B8%D0%BD%D0%B0%D0%BC%D0%BE%C2%BB_-_%C2%AB%D0%91%D0%B0%D1%80%D1%81%D0%B5%D0%BB%D0%BE%D0%BD%D0%B0%C2%BB_0-1._2_%D0%BD%D0%BE%D1%8F%D0%B1%D1%80%D1%8F_2021_%D0%B3%D0%BE%D0%B4%D0%B0._II_%E2%80%94_1289671_%28cropped%29.jpg',
  'Dani Olmo':            'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Dani_Olmo_2022.jpg/330px-Dani_Olmo_2022.jpg',
  'João Cancelo':         'https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Jo%C3%A3o_Cancelo_USMNT_v_Portugal_Mar_31_2026-30_%28cropped%29.jpg/330px-Jo%C3%A3o_Cancelo_USMNT_v_Portugal_Mar_31_2026-30_%28cropped%29.jpg',
  'Alejandro Balde':      'https://upload.wikimedia.org/wikipedia/commons/thumb/9/93/Esapana-inglaterra-74_%2848899354493%29.jpg/330px-Esapana-inglaterra-74_%2848899354493%29.jpg',
  'Andreas Christensen':  'https://r2.thesportsdb.com/images/media/player/thumb/lg5vvk1771261092.jpg',
  'Marcus Rashford':      'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Marcus_Rashford_England_v_Ghana_23_June_2026-036.jpg/330px-Marcus_Rashford_England_v_Ghana_23_June_2026-036.jpg',
  'Ferran Torres':        'https://upload.wikimedia.org/wikipedia/commons/thumb/3/34/Ferran_Torres_Garc%C3%ADa.png/330px-Ferran_Torres_Garc%C3%ADa.png',
  'Wojciech Szczęsny':    'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Wojciech_Szcz%C4%99sny.png/330px-Wojciech_Szcz%C4%99sny.png',
  'Fermín López':         'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Ferm%C3%ADn_L%C3%B3pez_%28cropped%29.jpg/330px-Ferm%C3%ADn_L%C3%B3pez_%28cropped%29.jpg',
  'Marc Casadó':          'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b9/Marc_Casad%C3%B3%2C_durant_la_gira_de_pretemporada_a_EUA._%2805-08-2024%29_%28cropped%29.jpg/330px-Marc_Casad%C3%B3%2C_durant_la_gira_de_pretemporada_a_EUA._%2805-08-2024%29_%28cropped%29.jpg',
  'Roony Bardghji':       'https://upload.wikimedia.org/wikipedia/commons/thumb/9/96/Roony_Bardghji%2C_Vejle_Boldklub_-_FC_K%C3%B8benhavn%2C_29._July_2023_-_opvarmning_%28cropped%29.jpg/330px-Roony_Bardghji%2C_Vejle_Boldklub_-_FC_K%C3%B8benhavn%2C_29._July_2023_-_opvarmning_%28cropped%29.jpg',
  'Marc Bernal':          'https://r2.thesportsdb.com/images/media/player/thumb/wxdd641771260961.jpg',
};

export function getPlayerPhoto(name: string): string | null {
  return PHOTOS[name] ?? null;
}
