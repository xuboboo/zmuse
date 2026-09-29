import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react-native";
import { useState } from "react";
import { Text, View } from "react-native";
import { Button, s } from "./ui";

interface PdfReaderProps {
  url: string;
  token: string;
  pageCount: number;
}
export default function PdfReader({ url, pageCount }: PdfReaderProps) {
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  return (
    <View style={{ gap: 12 }}>
      <View style={[s.between, { gap: 8, flexWrap: "wrap" }]}>
        <View style={[s.row, { gap: 8 }]}>
          <Button small icon={ChevronLeft} disabled={page <= 1} onPress={() => setPage(page - 1)}>
            上一页
          </Button>
          <Text style={s.small}>
            {page} / {pageCount}
          </Text>
          <Button
            small
            icon={ChevronRight}
            disabled={page >= pageCount}
            onPress={() => setPage(page + 1)}
          >
            下一页
          </Button>
        </View>
        <View style={[s.row, { gap: 8 }]}>
          <Button small icon={Minus} disabled={zoom <= 50} onPress={() => setZoom(zoom - 25)}>
            缩小
          </Button>
          <Text style={s.small}>{zoom}%</Text>
          <Button small icon={Plus} disabled={zoom >= 200} onPress={() => setZoom(zoom + 25)}>
            放大
          </Button>
        </View>
      </View>
      <iframe
        key={`${page}:${zoom}`}
        title="PDF 阅读器"
        src={`${url}#page=${page}&zoom=${zoom}`}
        style={{ height: 570, width: "100%", border: 0, borderRadius: 12, background: "#e7e9e3" }}
      />
      <Text style={s.small}>可用阅读器工具栏下载或打印副本。</Text>
    </View>
  );
}
