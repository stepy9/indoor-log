// The videos of Michal Novotný's "Sport je bolest" on YouTube, by their number in the book ("9.17"): each the
// 11-character id of its video in the book's playlist, played in the app through YouTube's privacy-enhanced
// player. A number without an id has no video button.
export const bookPlaylist = "PL0y0h5bh7_4mfGAwPw-QgOIFvUgkzq6S6";
export const bookVideos = {};
export const videoOf = (book) => (book && /^[\w-]{11}$/.test(bookVideos[book] ?? "") ? bookVideos[book] : null);
export const embedUrl = (id) => `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1`;
