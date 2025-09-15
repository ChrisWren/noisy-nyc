export const getEmojiForComplaint = (complaintType: string): string => {
  const lowerCaseType = complaintType.toLowerCase();

  if (lowerCaseType.includes("encampment")) return "⛺";
  if (lowerCaseType.includes("smoking") || lowerCaseType.includes("vaping"))
    return "🚬";
  if (lowerCaseType.includes("food")) return "🍔";
  if (lowerCaseType.includes("noise")) return "🔊";
  if (lowerCaseType.includes("heat") || lowerCaseType.includes("heating"))
    return "🔥";
  if (lowerCaseType.includes("water")) return "💧";
  if (lowerCaseType.includes("plumbing")) return "🚽";
  if (lowerCaseType.includes("blocked driveway")) return "🚗";
  if (lowerCaseType.includes("parking")) return "🚗";
  if (
    lowerCaseType.includes("trash") ||
    lowerCaseType.includes("sanitation") ||
    lowerCaseType.includes("disposal")
  )
    return "🗑️";
  if (lowerCaseType.includes("rodent") || lowerCaseType.includes("pest"))
    return "🐀";
  if (lowerCaseType.includes("tree")) return "🌳";
  if (lowerCaseType.includes("street light")) return "💡";
  if (
    lowerCaseType.includes("sidewalk") ||
    lowerCaseType.includes("road") ||
    lowerCaseType.includes("curb")
  )
    return "🚧";
  if (lowerCaseType.includes("graffiti")) return "🎨";

  return "❓";
};
