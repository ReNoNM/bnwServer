export const getNick = (userName: string, tag: string, tagPosition: string) => {
  return tagPosition === "end" ? userName + " " + tag : tag + " " + userName;
};
