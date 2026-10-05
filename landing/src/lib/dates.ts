/** "2026-10-05" → "5 October 2026" (fixed locale, no timezone drift). */
export const formatDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${d} ${months[m - 1]} ${y}`;
};
