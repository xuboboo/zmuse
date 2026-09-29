export function browserAddress(value: string): string {
  const input = value.trim();
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(input) ? input : `https://${input}`);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      /\s/.test(input)
    )
      throw new Error("无效地址");
    return url.href;
  } catch {
    throw new Error("请输入网站地址，例如 copilotkit.ai 或 https://news.ycombinator.com。");
  }
}

export function browserSite(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "") || "浏览器";
  } catch {
    return "浏览器";
  }
}
