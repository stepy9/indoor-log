// The videos of Michal Novotný's "Sport je bolest" on YouTube, by their number in the book ("9.17"): each the
// 11-character id of its video in the book's playlist, played in the app through YouTube's privacy-enhanced
// player. A number without an id has no video button.
export const bookPlaylist = "PL0y0h5bh7_4mfGAwPw-QgOIFvUgkzq6S6";
// Chapter 9, read from the playlist's titles ("Kniha Sport je bolest, 9.17 mobilita 1").
export const bookVideos = {
  "9.1": "5kStlmjQDi8",
  "9.2": "1uCeYqVByU0",
  "9.3": "3XMRbRcY8Bw",
  "9.4": "bJiY4-oIsTI",
  "9.5": "r2nIbGogaIU",
  "9.6": "it9AnKqwteQ",
  "9.7": "0y2Z2ffruP8",
  "9.8": "heZFjKK0dZE",
  "9.9": "EWR2YOWUQoo",
  "9.10": "Ksa0FJWwZDg",
  "9.11": "62JJloZm14U",
  "9.12": "9GqviectRgg",
  "9.13": "f3wRII0-vtk",
  "9.14": "qSzl0y1J2ZM",
  "9.15": "i-qfAv6RSuM",
  "9.16": "OqHtKk_P-dc",
  "9.17": "y-8llzequ6w",
  "9.18": "VzumDiEfAlY",
  "9.19": "dZFRViCYCZI",
  "9.20": "chiFmMhXAD0",
  "9.21": "qGVLm_CeqQE",
  "9.22": "GMMDXFpwbos",
  "9.23": "f3z9qpRMDlg",
  "9.24": "zC-01iBws1k",
  "9.25": "UuIzsvYaqO4",
  "9.26": "B4noogpHD58",
  "9.27": "Q_epNOjxsCs",
  "9.28": "ZfltF63Cv3c",
  "9.29": "YbkzXEsyaF8",
  "9.30": "SGSUzY3beo4",
  "9.31": "S_KzO5Lmp58",
  "9.32": "YYx4oxIhNm8",
  // Chapter 12: breathing.
  "12.1": "KzDRFktyYrQ",
};
export const videoOf = (book) => (book && /^[\w-]{11}$/.test(bookVideos[book] ?? "") ? bookVideos[book] : null);
export const embedUrl = (id) => `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1`;
