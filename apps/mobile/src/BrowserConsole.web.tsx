export default function BrowserConsole({ url }: { url: string }) {
  return (
    <iframe
      title="远程浏览器会话控制台"
      src={url}
      style={{ height: 540, width: "100%", border: 0, borderRadius: 12, background: "#FFF" }}
    />
  );
}
