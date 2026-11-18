import Lenis from "lenis";
import "lenis/dist/lenis.css";
import ArrowRight from "lucide-react/icons/arrow-right";
import ArrowUpRight from "lucide-react/icons/arrow-up-right";
import Bell from "lucide-react/icons/bell";
import Check from "lucide-react/icons/check";
import ChevronDown from "lucide-react/icons/chevron-down";
import Cpu from "lucide-react/icons/cpu";
import ListOrdered from "lucide-react/icons/list-ordered";
import Menu from "lucide-react/icons/menu";
import Network from "lucide-react/icons/network";
import X from "lucide-react/icons/x";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { cn } from "@trendifest/opendesk";
import { ThemeToggle } from "@/components/motion/theme-toggle";
import { EASE_OUT, SPRING_LAYOUT, SPRING_PANEL, SPRING_SWAP } from "@/lib/ease";

export interface LandingPageProps {
  onOpenApp: () => void;
}

/* ------------------------------------------------------------------ *
 * Grounded domain data (mirrors README.md & shared/segments.ts)      *
 * ------------------------------------------------------------------ */

interface PreviewTopic {
  id: string;
  rank: number;
  title: string;
  shortLabel: string;
  potential: number;
  phase: "Đang tăng" | "Duy trì" | "Hạ nhiệt";
  accounts: number;
  publishers: number;
  cx: number;
  cy: number;
  r: number;
  sparkPoints: number[];
  neighbors: string[];
  examples: {
    source: string;
    kind: "Cộng đồng" | "Báo chí";
    time: string;
    excerpt: string;
  }[];
}

type WindowKey = "24h" | "3d" | "7d";
type PreviewView = "graph" | "board";

const WINDOW_INDEX: Record<WindowKey, number> = {
  "24h": 0,
  "3d": 1,
  "7d": 2,
};

const PREVIEW_WINDOWS: Record<
  WindowKey,
  {
    windowLabel: string;
    topicCount: string;
    linkCount: string;
    topics: PreviewTopic[];
  }
> = {
  "24h": {
    windowLabel: "24 giờ qua",
    topicCount: "312 chủ đề",
    linkCount: "74 liên kết đo được",
    topics: [
      {
        id: "metro-ben-thanh",
        rank: 1,
        title: "Điều chỉnh lộ trình xe buýt kết nối tuyến Metro số 1",
        shortLabel: "Buýt kết nối Metro số 1",
        potential: 78,
        phase: "Đang tăng",
        accounts: 19,
        publishers: 4,
        cx: 228,
        cy: 122,
        r: 18,
        sparkPoints: [42, 48, 51, 59, 66, 72, 78],
        neighbors: ["ve-lien-thong", "bai-gui-xe", "buyt-dien-155"],
        examples: [
          {
            source: "VOZ",
            kind: "Cộng đồng",
            time: "Hoạt động 2 giờ trước",
            excerpt:
              "Từ Thủ Đức đi vào trung tâm sáng nay có thêm tuyến gom mới, đỡ kẹt đoạn ngã tư Thủ Đức hơn hẳn.",
          },
          {
            source: "Tuổi Trẻ",
            kind: "Báo chí",
            time: "Xuất bản 4 giờ trước",
            excerpt:
              "Trung tâm Quản lý Giao thông công cộng TP.HCM điều chỉnh lộ trình 17 tuyến buýt gom hành khách qua các ga.",
          },
        ],
      },
      {
        id: "ve-lien-thong",
        rank: 2,
        title: "Đề xuất giá vé liên thông xe buýt – đường sắt đô thị",
        shortLabel: "Giá vé liên thông",
        potential: 64,
        phase: "Duy trì",
        accounts: 12,
        publishers: 3,
        cx: 376,
        cy: 84,
        r: 14,
        sparkPoints: [58, 60, 61, 63, 62, 64, 64],
        neighbors: ["metro-ben-thanh", "bai-gui-xe"],
        examples: [
          {
            source: "VnExpress",
            kind: "Báo chí",
            time: "Xuất bản 5 giờ trước",
            excerpt:
              "Phương án vé tích hợp theo ngày và theo tháng giúp giảm chi phí chuyển tuyến cho người đi làm.",
          },
          {
            source: "VOZ",
            kind: "Cộng đồng",
            time: "Hoạt động 7 giờ trước",
            excerpt:
              "Nếu áp dụng chung một thẻ quẹt giữa xe buýt gom và ga tàu thì đi làm hằng ngày tiện hơn nhiều.",
          },
        ],
      },
      {
        id: "bai-gui-xe",
        rank: 3,
        title: "Bố trí bãi gửi xe cá nhân dọc nhà ga trên cao",
        shortLabel: "Bãi gửi xe nhà ga",
        potential: 57,
        phase: "Đang tăng",
        accounts: 9,
        publishers: 2,
        cx: 348,
        cy: 196,
        r: 12,
        sparkPoints: [34, 38, 40, 44, 49, 53, 57],
        neighbors: ["metro-ben-thanh", "ve-lien-thong"],
        examples: [
          {
            source: "Otofun",
            kind: "Cộng đồng",
            time: "Hoạt động 6 giờ trước",
            excerpt:
              "Nếu bãi gửi xe máy ở các ga vành đai đủ rộng thì người ở xa mới bỏ xe đi tàu vào nội đô được.",
          },
          {
            source: "Thanh Niên",
            kind: "Báo chí",
            time: "Xuất bản 8 giờ trước",
            excerpt:
              "Các điểm giữ xe tạm quanh nhà ga trên cao được rà soát để đáp ứng nhu cầu gửi xe ban ngày.",
          },
        ],
      },
      {
        id: "buyt-dien-155",
        rank: 4,
        title: "Lịch chạy thực tế tuyến buýt điện 155 qua khu trung tâm",
        shortLabel: "Tuyến buýt điện 155",
        potential: 49,
        phase: "Duy trì",
        accounts: 7,
        publishers: 1,
        cx: 112,
        cy: 178,
        r: 11,
        sparkPoints: [41, 44, 46, 47, 48, 49, 49],
        neighbors: ["metro-ben-thanh"],
        examples: [
          {
            source: "VOZ",
            kind: "Cộng đồng",
            time: "Hoạt động 9 giờ trước",
            excerpt:
              "Ai đi tuyến buýt điện 155 rồi cho xin nhận xét giờ chạy thực tế buổi chiều có đúng lịch không.",
          },
        ],
      },
    ],
  },
  "3d": {
    windowLabel: "3 ngày qua",
    topicCount: "684 chủ đề",
    linkCount: "168 liên kết đo được",
    topics: [
      {
        id: "metro-ben-thanh",
        rank: 1,
        title: "Điều chỉnh lộ trình xe buýt kết nối tuyến Metro số 1",
        shortLabel: "Buýt kết nối Metro số 1",
        potential: 82,
        phase: "Đang tăng",
        accounts: 34,
        publishers: 5,
        cx: 228,
        cy: 122,
        r: 19,
        sparkPoints: [45, 52, 58, 66, 73, 79, 82],
        neighbors: ["ve-lien-thong", "bai-gui-xe", "buyt-dien-155"],
        examples: [
          {
            source: "Thanh Niên",
            kind: "Báo chí",
            time: "Xuất bản 1 ngày trước",
            excerpt:
              "Ghi nhận lượng hành khách chuyển tiếp tại ga Bến Thành và Suối Tiên tăng đều trong khung giờ cao điểm.",
          },
          {
            source: "VOZ",
            kind: "Cộng đồng",
            time: "Hoạt động 1 ngày trước",
            excerpt:
              "Ai đi tuyến buýt điện 155 rồi cho xin nhận xét giờ chạy thực tế buổi chiều có đúng lịch không.",
          },
        ],
      },
      {
        id: "ve-lien-thong",
        rank: 2,
        title: "Đề xuất giá vé liên thông xe buýt – đường sắt đô thị",
        shortLabel: "Giá vé liên thông",
        potential: 68,
        phase: "Duy trì",
        accounts: 16,
        publishers: 4,
        cx: 376,
        cy: 84,
        r: 15,
        sparkPoints: [55, 59, 63, 65, 67, 68, 68],
        neighbors: ["metro-ben-thanh", "bai-gui-xe"],
        examples: [
          {
            source: "Dân trí",
            kind: "Báo chí",
            time: "Xuất bản 2 ngày trước",
            excerpt:
              "Đơn vị vận hành thử nghiệm thanh toán không tiền mặt liên thông giữa các phương thức công cộng.",
          },
        ],
      },
      {
        id: "bai-gui-xe",
        rank: 3,
        title: "Bố trí bãi gửi xe cá nhân dọc nhà ga trên cao",
        shortLabel: "Bãi gửi xe nhà ga",
        potential: 59,
        phase: "Duy trì",
        accounts: 14,
        publishers: 3,
        cx: 348,
        cy: 196,
        r: 13,
        sparkPoints: [40, 46, 51, 55, 57, 58, 59],
        neighbors: ["metro-ben-thanh", "ve-lien-thong"],
        examples: [
          {
            source: "Otofun",
            kind: "Cộng đồng",
            time: "Hoạt động 2 ngày trước",
            excerpt:
              "Các bãi giữ xe quanh ga cần công khai sức chứa theo giờ để người đi làm chủ động sắp xếp.",
          },
        ],
      },
      {
        id: "buyt-dien-155",
        rank: 4,
        title: "Lịch chạy thực tế tuyến buýt điện 155 qua khu trung tâm",
        shortLabel: "Tuyến buýt điện 155",
        potential: 52,
        phase: "Duy trì",
        accounts: 11,
        publishers: 2,
        cx: 112,
        cy: 178,
        r: 11,
        sparkPoints: [38, 42, 45, 48, 50, 51, 52],
        neighbors: ["metro-ben-thanh"],
        examples: [
          {
            source: "VnExpress",
            kind: "Báo chí",
            time: "Xuất bản 2 ngày trước",
            excerpt:
              "Các tuyến buýt điện mới có tần suất 8–12 phút mỗi chuyến vào giờ cao điểm sáng.",
          },
        ],
      },
    ],
  },
  "7d": {
    windowLabel: "7 ngày qua",
    topicCount: "1.420 chủ đề",
    linkCount: "377 liên kết đo được",
    topics: [
      {
        id: "metro-ben-thanh",
        rank: 1,
        title: "Điều chỉnh lộ trình xe buýt kết nối tuyến Metro số 1",
        shortLabel: "Buýt kết nối Metro số 1",
        potential: 84,
        phase: "Duy trì",
        accounts: 48,
        publishers: 6,
        cx: 228,
        cy: 122,
        r: 20,
        sparkPoints: [39, 49, 60, 71, 78, 82, 84],
        neighbors: ["ve-lien-thong", "bai-gui-xe", "buyt-dien-155"],
        examples: [
          {
            source: "VnExpress",
            kind: "Báo chí",
            time: "Xuất bản 3 ngày trước",
            excerpt:
              "Mạng lưới tuyến gom giúp mở rộng bán kính tiếp cận nhà ga cho sinh viên và nhân viên văn phòng.",
          },
          {
            source: "VOZ",
            kind: "Cộng đồng",
            time: "Hoạt động 4 ngày trước",
            excerpt:
              "Tổng hợp các tuyến buýt đi ngang qua ga Thảo Điền và An Phú kèm thời gian giãn cách chuyến.",
          },
        ],
      },
      {
        id: "ve-lien-thong",
        rank: 2,
        title: "Đề xuất giá vé liên thông xe buýt – đường sắt đô thị",
        shortLabel: "Giá vé liên thông",
        potential: 71,
        phase: "Duy trì",
        accounts: 21,
        publishers: 4,
        cx: 376,
        cy: 84,
        r: 15,
        sparkPoints: [48, 54, 61, 65, 68, 70, 71],
        neighbors: ["metro-ben-thanh", "bai-gui-xe"],
        examples: [
          {
            source: "Người Việt",
            kind: "Báo chí",
            time: "Xuất bản 5 ngày trước",
            excerpt:
              "Chuyên gia giao thông đề xuất chính sách trợ giá vé tháng để khuyến khích chuyển đổi thói quen đi lại.",
          },
        ],
      },
      {
        id: "bai-gui-xe",
        rank: 3,
        title: "Bố trí bãi gửi xe cá nhân dọc nhà ga trên cao",
        shortLabel: "Bãi gửi xe nhà ga",
        potential: 55,
        phase: "Hạ nhiệt",
        accounts: 15,
        publishers: 3,
        cx: 348,
        cy: 196,
        r: 12,
        sparkPoints: [61, 63, 62, 60, 58, 56, 55],
        neighbors: ["metro-ben-thanh", "ve-lien-thong"],
        examples: [
          {
            source: "Otofun",
            kind: "Cộng đồng",
            time: "Hoạt động 6 ngày trước",
            excerpt:
              "Nhiều khu vực quanh nhà ga vẫn thiếu điểm trung chuyển an toàn cho xe máy gửi qua ngày.",
          },
        ],
      },
      {
        id: "buyt-dien-155",
        rank: 4,
        title: "Lịch chạy thực tế tuyến buýt điện 155 qua khu trung tâm",
        shortLabel: "Tuyến buýt điện 155",
        potential: 47,
        phase: "Hạ nhiệt",
        accounts: 12,
        publishers: 2,
        cx: 112,
        cy: 178,
        r: 11,
        sparkPoints: [54, 53, 52, 50, 49, 48, 47],
        neighbors: ["metro-ben-thanh"],
        examples: [
          {
            source: "Tuổi Trẻ",
            kind: "Báo chí",
            time: "Xuất bản 6 ngày trước",
            excerpt:
              "Hành khách có thể tra cứu vị trí xe theo thời gian thực để canh giờ chuyển tuyến ở ga trung tâm.",
          },
        ],
      },
    ],
  },
};

const PREVIEW_EDGES: { a: string; b: string; sim: string; lx: number; ly: number }[] = [
  { a: "metro-ben-thanh", b: "ve-lien-thong", sim: "0.842", lx: 306, ly: 92 },
  { a: "metro-ben-thanh", b: "bai-gui-xe", sim: "0.804", lx: 308, ly: 174 },
  { a: "ve-lien-thong", b: "bai-gui-xe", sim: "0.751", lx: 374, ly: 142 },
  { a: "metro-ben-thanh", b: "buyt-dien-155", sim: "0.788", lx: 162, ly: 140 },
];

const HERO_SPECS = [
  { value: "8", unit: "", label: "Nguồn thu thập công khai", note: "2 diễn đàn · 6 đầu báo" },
  { value: "53", unit: "", label: "Luồng RSS chuyên mục", note: "Hợp nhất theo liên kết gốc" },
  { value: "384", unit: "", label: "Chiều vector E5-small", note: "Suy luận hoàn toàn cục bộ" },
  { value: "72", unit: "giờ", label: "Chuỗi quan sát lưu giữ", note: "Cửa sổ 24h · 3d · 7d" },
];

const COMMUNITY_SOURCES = [
  {
    name: "VOZ",
    endpoint: "voz.vn/f/17/index.rss",
    note: "Trích đoạn bài mở đầu và mốc thời gian hoạt động diễn đàn",
  },
  {
    name: "Otofun",
    endpoint: "otofun.net.vn/forums/77/index.rss",
    note: "Thảo luận cộng đồng công khai kèm định danh nguồn riêng",
  },
];

const NEWS_SOURCES = [
  { name: "VnExpress", detail: "13 chuyên mục RSS chính thức" },
  { name: "Tuổi Trẻ", detail: "14 chuyên mục RSS (múi giờ UTC+7)" },
  { name: "Thanh Niên", detail: "14 chuyên mục RSS chính thức" },
  { name: "Dân trí", detail: "12 chuyên mục RSS, tái xác thực ETag" },
  { name: "Người Việt", detail: "Mục Việt Nam qua WordPress REST" },
  { name: "Google News VN", detail: "Trang nhất tin tức tổng hợp tiếng Việt" },
];

const COMPARISON_ROWS = [
  {
    criteria: "Phân biệt nguồn chứng cứ",
    traditional:
      "Gộp chung tin báo chí, bài đăng cộng đồng và lượt chia sẻ thành một tổng lượt nhắc chung.",
    trendifest:
      "Tách riêng số tài khoản cộng đồng độc lập với số đầu báo; tin tức không bao giờ bị tính thành người dùng.",
  },
  {
    criteria: "Cách gom nhóm chủ đề",
    traditional:
      "Phụ thuộc từ khóa hoặc hashtag định sẵn, dễ bỏ sót các tiêu đề viết khác nhau về cùng một sự việc.",
    trendifest:
      "Nhúng cục bộ bằng multilingual-e5-small và gom cụm liên kết hoàn chỉnh, tách riêng từng phiên bản hoặc sự kiện.",
  },
  {
    criteria: "Chống thổi phồng số liệu",
    traditional:
      "Một tin phát hành lại trên nhiều chuyên mục hoặc bài chép nguyên văn dễ làm tăng giả tạo mức độ quan tâm.",
    trendifest:
      "Khử trùng lặp bài đăng giống hệt và tiêu đề báo đồng phát hành; chỉ tính mỗi tác giả hoặc đầu báo độc lập một lần.",
  },
  {
    criteria: "Khả năng kiểm chứng",
    traditional:
      "Hiển thị điểm số hộp đen hoặc nhận định sinh tự động mà không gắn liền với bằng chứng gốc.",
    trendifest:
      "Mỗi điểm số đều kèm thành phần cấu thành, mốc quan sát theo giờ và liên kết trực tiếp về bài viết nguồn.",
  },
];

const PIPELINE_STEPS = [
  {
    step: "01",
    title: "Thu thập có giới hạn & kiểm lọc tiếng Việt",
    summary:
      "Đọc các nguồn RSS/REST công khai theo chu kỳ (tối đa 500–1.000 bản ghi/nguồn), chuẩn hóa Unicode, cắt ở 2.000 ký tự và lọc ngôn ngữ bằng franc-min.",
    detail:
      "Loại bỏ bản ghi quá 30 ngày, văn bản dưới 25 chữ cái hoặc bài tiếng Anh nhắc đến Việt Nam. Giữ nguyên phân loại nguồn báo chí và diễn đàn ngay từ đầu vào.",
    specs: ["≤ 1 MB / phản hồi HTTP", "Hạn 15 giây / yêu cầu", "Tối thiểu 25 chữ cái"],
  },
  {
    step: "02",
    title: "Suy luận vector hoàn toàn cục bộ",
    summary:
      "Tính vector 384 chiều bằng Xenova/multilingual-e5-small ngay trên máy chủ nội bộ; không gửi nội dung bài viết ra API bên ngoài.",
    detail:
      "Ngoài E5 cho định danh chủ đề, hệ thống lưu trữ thêm không gian MiniLM, CLIP và CLAP phục vụ truy vấn tìm kiếm đa phương thức và khử trùng lặp gần giống.",
    specs: ["E5-small 384 chiều", "MiniLM / CLIP / CLAP", "Không rời máy chủ nội bộ"],
  },
  {
    step: "03",
    title: "Gom cụm hoàn chỉnh & nối liên kết đo được",
    summary:
      "Bản ghi mới phải đạt ngưỡng tương đồng với mọi thành viên trong cụm (complete-linkage) và vượt qua kiểm tra thực thể, phiên bản, địa danh.",
    detail:
      "Nhờ vậy, GPT-5 và GPT-4.1 đứng thành hai nốt riêng nhưng vẫn nối với nhau qua ngữ nghĩa chung, tối đa 3 liên kết mỗi chủ đề và giữ nguyên các nốt độc lập.",
    specs: ["Complete-linkage", "Tối đa 3 liên kết/nốt", "Tách bạch phiên bản"],
  },
  {
    step: "04",
    title: "Kiểm duyệt gộp/tách & theo dõi ngưỡng cảnh báo",
    summary:
      "Người phân tích có thể gộp chủ đề bị tách nhầm hoặc tách riêng một tập bản ghi kèm ghi chú kiểm toán và lịch sử hoàn tác an toàn.",
    detail:
      "Tính năng Watchlist theo dõi chủ đề hoặc thực thể với mốc tham chiếu mới (baseline), đánh giá định kỳ và phát thông báo ngay trong ứng dụng.",
    specs: ["Khóa phiên bản cụm", "Hoàn tác an toàn", "Tối đa 100 quy tắc"],
  },
];

interface ScoreScenario {
  id: string;
  label: string;
  accounts: number;
  publishers: number;
  score: number;
  multiplier: string;
  note: string;
  bars: {
    name: string;
    weight: number;
    fill: number;
    description: string;
    accent?: boolean;
  }[];
}

const SCORE_SCENARIOS: ScoreScenario[] = [
  {
    id: "single-forum",
    label: "1 diễn đàn vừa xuất hiện",
    accounts: 2,
    publishers: 0,
    score: 26,
    multiplier: "0.58×",
    note: "Chỉ mới có 2 tài khoản trên 1 diễn đàn; Velocity giữ trung tính vì chưa đủ hai cửa sổ 6 giờ liên tiếp.",
    bars: [
      {
        name: "Reach (34%)",
        weight: 34,
        fill: 32,
        description:
          "Số tài khoản cộng đồng độc lập và đầu báo đưa tin, quy đổi theo thang logarit.",
        accent: true,
      },
      {
        name: "Velocity (26%)",
        weight: 26,
        fill: 50,
        description:
          "Giữ ở mức trung tính cho tới khi tích lũy đủ hai cửa sổ quan sát 6 giờ liên tiếp.",
      },
      {
        name: "Spread (18%)",
        weight: 18,
        fill: 15,
        description: "Mới ghi nhận trên 1 nguồn thu thập duy nhất.",
      },
      {
        name: "Persistence (12%)",
        weight: 12,
        fill: 20,
        description: "Thời gian quan sát cục bộ mới đạt khoảng 2 giờ.",
      },
      {
        name: "Diversity (10%)",
        weight: 10,
        fill: 65,
        description: "Tỷ lệ nguồn độc lập trên tổng bản ghi còn nhỏ nhưng không bị lặp tài khoản.",
      },
    ],
  },
  {
    id: "syndicated-news",
    label: "Báo chí đồng phát hành",
    accounts: 1,
    publishers: 3,
    score: 52,
    multiplier: "0.86×",
    note: "Các tiêu đề báo đồng phát hành (syndicated) được gộp để tránh nhân đôi độ phủ; 3 đầu báo + 1 tài khoản cho hệ số 0.86×.",
    bars: [
      {
        name: "Reach (34%)",
        weight: 34,
        fill: 62,
        description: "3 đầu báo độc lập và 1 tài khoản diễn đàn trong cửa sổ hiện tại.",
        accent: true,
      },
      {
        name: "Velocity (26%)",
        weight: 26,
        fill: 54,
        description: "Nhịp bổ sung ổn định giữa hai cửa sổ 6 giờ liên tiếp.",
      },
      {
        name: "Spread (18%)",
        weight: 18,
        fill: 50,
        description: "Xuất hiện đồng thời ở mảng báo chí và thảo luận cộng đồng.",
      },
      {
        name: "Persistence (12%)",
        weight: 12,
        fill: 58,
        description: "Duy trì quan sát qua 18 giờ liên tục không đứt quãng.",
      },
      {
        name: "Diversity (10%)",
        weight: 10,
        fill: 72,
        description: "Mỗi đầu báo chỉ được tính một lần sau khi khử trùng lặp chuyên mục.",
      },
    ],
  },
  {
    id: "cross-source-surge",
    label: "Đa nguồn tăng tốc",
    accounts: 48,
    publishers: 6,
    score: 84,
    multiplier: "1.00×",
    note: "Đạt trần hệ số tin cậy 1.00× khi tổng tài khoản độc lập và đầu báo vượt 5; tốc độ bổ sung nguồn mới vượt cửa sổ 6 giờ liền trước.",
    bars: [
      {
        name: "Reach (34%)",
        weight: 34,
        fill: 92,
        description: "48 tài khoản độc lập cùng 6 đầu báo lớn ghi nhận cùng chủ đề.",
        accent: true,
      },
      {
        name: "Velocity (26%)",
        weight: 26,
        fill: 86,
        description: "Gia tốc nguồn mới ở cửa sổ 6 giờ sau cao hơn rõ rệt so với cửa sổ trước.",
      },
      {
        name: "Spread (18%)",
        weight: 18,
        fill: 88,
        description: "Hiện diện trên 7/8 nguồn thu thập trong danh mục công khai.",
      },
      {
        name: "Persistence (12%)",
        weight: 12,
        fill: 78,
        description:
          "Chuỗi quan sát theo giờ kéo dài nhiều ngày không có khoảng trống quá 75 phút.",
      },
      {
        name: "Diversity (10%)",
        weight: 10,
        fill: 81,
        description: "Tỷ lệ cao người tham gia độc lập trên tổng số bản ghi thu được.",
      },
    ],
  },
];

const USE_CASES = [
  {
    id: "editorial",
    tab: "Ban biên tập & Truyền thông",
    headline: "Đối chiếu nhanh chủ đề nào đang được cả báo chí lẫn diễn đàn bàn luận",
    description:
      "Thay vì dò thủ công từng chuyên mục báo và trang diễn đàn, đội ngũ nội dung mở Bảng chủ đề (Topic Board) để xem thứ hạng toàn bản đồ, giai đoạn tăng/giảm và đường dẫn gốc.",
    points: [
      "Tách bạch số liệu: biết rõ một chủ đề đến từ nhiều đầu báo hay từ thảo luận cộng đồng.",
      "Lọc theo thực thể: tra cứu không dấu tên người, tổ chức, địa danh hoặc phiên bản sản phẩm.",
      "Đọc trích đoạn nguyên bản và mở thẳng bài báo hoặc chủ đề diễn đàn để xác minh.",
    ],
    artifactTitle: "Bảng chủ đề (Topic Board)",
    artifactRows: [
      {
        rank: "01",
        label: "Điều chỉnh lộ trình xe buýt kết nối tuyến Metro số 1",
        score: "84/100",
        meta: "48 tài khoản · 6 đầu báo · Duy trì",
      },
      {
        rank: "02",
        label: "Đề xuất giá vé liên thông xe buýt – đường sắt đô thị",
        score: "71/100",
        meta: "21 tài khoản · 4 đầu báo · Đang tăng",
      },
      {
        rank: "03",
        label: "Bố trí bãi gửi xe cá nhân dọc nhà ga trên cao",
        score: "55/100",
        meta: "15 tài khoản · 3 đầu báo · Hạ nhiệt",
      },
    ],
  },
  {
    id: "research",
    tab: "Nghiên cứu xã hội số",
    headline: "Ghi nhận chuỗi quan sát thực tế và kiểm soát chất lượng gom cụm",
    description:
      "Mỗi bản ghi lưu riêng thời điểm xuất bản, hoạt động diễn đàn và thời điểm thu thập theo giờ ICT (UTC+7), cho phép rà soát lịch sử không suy đoán.",
    points: [
      "Không bịa đường cong quá khứ: biểu đồ sparkline chỉ vẽ từ các mẫu thực sự đã quan sát.",
      "Kiểm duyệt con người (HITL): gộp hoặc tách chủ đề có khóa phiên bản và hoàn tác được.",
      "Minh bạch giới hạn mẫu: hiển thị rõ phần nào chưa đo lường thay vì điền số 0.",
    ],
    artifactTitle: "Nhật ký kiểm duyệt chủ đề",
    artifactRows: [
      {
        rank: "Tách",
        label: "Tách 4 bản ghi về bãi gửi xe khỏi cụm lộ trình xe buýt",
        score: "Đã khóa",
        meta: "Ghi chú: khác nhóm hạ tầng · Có thể hoàn tác",
      },
      {
        rank: "Gộp",
        label: "Gộp 2 bản tin cùng về phương án vé liên thông",
        score: "Đã lưu",
        meta: "Kiểm tra tương thích thực thể và năm: hợp lệ",
      },
    ],
  },
  {
    id: "brand",
    tab: "Thương hiệu & Agency",
    headline: "Theo dõi chủ đề hoặc thực thể cụ thể bằng ngưỡng tùy chỉnh",
    description:
      "Tạo quy tắc theo dõi cho tên sản phẩm, địa bàn hoặc chủ đề đang quan tâm mà không bị nhiễu bởi dữ liệu cũ trước thời điểm bật cảnh báo.",
    points: [
      "Đặt mốc baseline tức thì: chỉ thông báo khi có bằng chứng mới sau khi lưu quy tắc.",
      "Kết hợp ngưỡng đầu báo mới, tài khoản mới và sàn điểm nổi lên tối thiểu.",
      "Quản lý tối đa 100 quy tắc theo dõi: tạm dừng, sửa ngưỡng hoặc xóa có xác nhận.",
    ],
    artifactTitle: "Quy tắc theo dõi (Watchlist)",
    artifactRows: [
      {
        rank: "Bật",
        label: "Thực thể: Tuyến Metro số 1 (TP.HCM)",
        score: "Sàn 60",
        meta: "Cảnh báo khi có ≥ 2 đầu báo mới trong 12 giờ",
      },
      {
        rank: "Tạm dừng",
        label: "Chủ đề: Giá vé liên thông giao thông công cộng",
        score: "Sàn 50",
        meta: "Baseline lưu lúc 09:15 ICT · Chờ tiếp tục",
      },
    ],
  },
  {
    id: "analyst",
    tab: "Phân tích dữ liệu độc lập",
    headline: "Vận hành hoàn toàn nội bộ với Postgres/pgvector và mô hình mở",
    description:
      "Kiến trúc tách biệt luồng thu thập nền với API truy vấn bản đồ. Worker tính toán phân cụm và liên kết nằm ngoài vòng lặp sự kiện HTTP để giao diện luôn phản hồi nhanh.",
    points: [
      "Cửa sổ 24h, 3d, 7d giữ bộ nhớ đệm riêng cho từng lát cắt, không cắt giả từ một tập chung.",
      "Cảnh báo rõ nếu dữ liệu bị cắt ngưỡng (tối đa 8.000 bản ghi gần nhất / 1.500 nốt).",
      "Hỗ trợ tìm kiếm vector đa phương thức qua MiniLM, CLIP và CLAP trên cùng cơ sở dữ liệu.",
    ],
    artifactTitle: "Trạng thái thu thập & chỉ mục",
    artifactRows: [
      {
        rank: "8/8",
        label: "Nguồn công khai đã hoàn tất chu kỳ thu thập gần nhất",
        score: "0 lỗi",
        meta: "Chuẩn hóa Unicode · Kiểm tra franc-min đạt chuẩn",
      },
      {
        rank: "E5",
        label: "Xenova/multilingual-e5-small (q8, 384 chiều)",
        score: "Cục bộ",
        meta: "Không còn bản ghi chờ tính vector",
      },
    ],
  },
];

const FAQS = [
  {
    question: "Trendifest khác gì với Google Trends hay các công cụ Social Listening thông thường?",
    answer:
      "Google Trends đo lượng người chủ động tìm kiếm một từ khóa sau khi chủ đề đã phổ biến. Các công cụ lắng nghe mạng xã hội truyền thống thường gộp lượt xem, hashtag và tin báo chí vào chung một chỉ số. Trendifest gom nhóm các bài viết công khai theo ngữ nghĩa cục bộ, tách riêng số tài khoản diễn đàn với số đầu báo và gắn mọi nhận định vào danh sách bài gốc kiểm chứng được.",
  },
  {
    question: "Điểm nổi lên (Emergence Score 0–100) có phải là dự báo xu hướng tương lai không?",
    answer:
      "Không. Đây là điểm heuristic mô tả mức độ xuất hiện và lan tỏa đã quan sát được dựa trên năm thành phần: Reach (34%), Velocity (26%), Spread (18%), Persistence (12%) và Diversity (10%), nhân với hệ số tin cậy theo số nguồn độc lập. Hệ thống không đưa ra dự đoán tương lai hay bịa số liệu cho khoảng thời gian chưa quan sát.",
  },
  {
    question: "Vì sao số lượng tài khoản cộng đồng và số đầu báo được tách riêng?",
    answer:
      "Một bài viết từ đầu báo đại diện cho một đơn vị xuất bản, không phải hàng trăm phản ứng của công chúng; ngược lại, nhiều tờ báo cùng đăng lại một bản tin đồng phát hành (syndicated) cũng được khử trùng lặp khi chấm điểm để tránh tạo cảm giác ủng hộ độc lập giả tạo.",
  },
  {
    question: "Dữ liệu thu thập có tuân thủ pháp luật và quyền riêng tư không?",
    answer:
      "Hệ thống chỉ đọc các nguồn RSS và REST công khai trong danh mục cấu hình (VOZ, Otofun và 6 đầu báo tiếng Việt), không vượt tường xác thực hay cào dữ liệu cá nhân ẩn danh. Toàn bộ mô hình AI nhúng vector chạy cục bộ, dữ liệu tự động hết hạn sau 30 ngày và kiến trúc được đối chiếu theo Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 cùng Nghị định 356/2025/NĐ-CP.",
  },
  {
    question: "Nếu thuật toán gom nhầm hai sự kiện khác nhau thì xử lý thế nào?",
    answer:
      "Trong ngăn chi tiết của mỗi chủ đề luôn có mục Review topic grouping. Người dùng có thể tách các bản ghi được chọn sang một chủ đề bền vững mới hoặc gộp hai chủ đề tương thích, kèm ghi chú lý do bắt buộc, lịch sử kiểm toán và nút hoàn tác an toàn.",
  },
];

/* ------------------------------------------------------------------ *
 * Small Primitives                                                   *
 * ------------------------------------------------------------------ */

function BrandMark() {
  return (
    <svg viewBox="0 0 32 32" className="size-7 shrink-0" aria-hidden="true">
      <rect width="32" height="32" rx="8" className="fill-fg" />
      <path
        d="M7 21.5 12.5 15l4.5 4 8-9"
        fill="none"
        className="stroke-inverse-fg"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19.5 10H25v5.5"
        fill="none"
        className="stroke-inverse-fg"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Matches src/components/sparkline.tsx: 1.5px stroke + terminal anchor dot. */
function MiniSparkline({
  points,
  animateDraw = false,
}: {
  points: readonly number[];
  animateDraw?: boolean;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const width = 56;
  const height = 18;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = Math.max(1, max - min);
  const coords = points.map((value, idx) => {
    const x = (idx / Math.max(1, points.length - 1)) * (width - 4) + 2;
    const y = height - 3 - ((value - min) / span) * (height - 6);
    return [x, y] as const;
  });
  const d = coords
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const [lastX, lastY] = coords[coords.length - 1] ?? [width - 2, height / 2];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0 overflow-visible"
      aria-hidden="true"
    >
      <motion.path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-fg-3"
        initial={animateDraw && !reduceMotion ? { pathLength: 0.2, opacity: 0.4 } : false}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.28, ease: EASE_OUT }}
      />
      <circle cx={lastX} cy={lastY} r={2} className="fill-fg" />
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * Side Scroll Ruler Component (Striped Horizontal Dash Indicator)    *
 * ------------------------------------------------------------------ */

interface SideScrollRulerProps {
  /** Scrolls the page to the requested `[0, 1]` document ratio. */
  onScrollToRatio: (ratio: number) => void;
}

/**
 * Minimalist vertical viewport scroll indicator pinned to the right margin,
 * rendering 24 horizontal ticks shaped by a raised-cosine hill profile.
 *
 * Behavior & Mathematical Model:
 * - The viewport scroll ratio maps continuously to the crest of the hill
 *   (28px width, full contrast), while neighboring ticks taper with
 *   `0.5 * (1 + cos(pi * d / radius))` back to 10px hairlines at 20% opacity.
 * - `hillRadius` scales with `viewportRatio` (`innerHeight / scrollHeight`,
 *   clamped to `[2.6, 4.2]`) so the crest reflects the visible page fraction.
 * - Clicking any tick calls `onScrollToRatio` with `idx / (TOTAL_TICKS - 1)`.
 *
 * Concurrency & Side Effects:
 * - Attaches passive `scroll` and `resize` listeners on `window` plus a
 *   `ResizeObserver` on `document.documentElement`, coalescing updates via
 *   `requestAnimationFrame` and cleaning up all observers/frames on unmount.
 */
function SideScrollRuler({ onScrollToRatio }: SideScrollRulerProps) {
  const [scrollState, setScrollState] = useState({ ratio: 0, viewportRatio: 0.15 });
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const TOTAL_TICKS = 24;
  const MIN_WIDTH = 10;
  const MAX_ADDITIONAL_WIDTH = 18;

  useEffect(() => {
    let rafId: number | null = null;

    const updateScroll = () => {
      const scrollY = window.scrollY;
      const innerHeight = window.innerHeight;
      const scrollHeight = document.documentElement.scrollHeight;
      const maxScroll = scrollHeight - innerHeight;

      if (maxScroll <= 0) {
        setScrollState({ ratio: 0, viewportRatio: 1 });
        return;
      }

      const ratio = Math.min(1, Math.max(0, scrollY / maxScroll));
      const viewportRatio = Math.min(1, Math.max(0.05, innerHeight / scrollHeight));
      setScrollState({ ratio, viewportRatio });
    };

    const handleScrollOrResize = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        updateScroll();
        rafId = null;
      });
    };

    window.addEventListener("scroll", handleScrollOrResize, { passive: true });
    window.addEventListener("resize", handleScrollOrResize, { passive: true });
    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(handleScrollOrResize) : null;
    resizeObserver?.observe(document.documentElement);
    updateScroll();

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", handleScrollOrResize);
      window.removeEventListener("resize", handleScrollOrResize);
      resizeObserver?.disconnect();
    };
  }, []);

  const centerIdx = scrollState.ratio * (TOTAL_TICKS - 1);
  const hillRadius = Math.max(2.6, Math.min(4.2, scrollState.viewportRatio * TOTAL_TICKS * 1.3));

  return (
    <nav
      aria-label="Thước đo vị trí khung nhìn trang"
      className="fixed right-2.5 sm:right-3.5 top-1/2 -translate-y-1/2 z-30 hidden md:flex flex-col items-end gap-1.5 pointer-events-auto select-none"
    >
      {Array.from({ length: TOTAL_TICKS }).map((_, idx) => {
        const dist = Math.abs(idx - centerIdx);

        // Raised-cosine hill curve (intensity from 0 at base to 1.0 at crest).
        let intensity = 0;
        if (dist < hillRadius) {
          intensity = 0.5 * (1 + Math.cos((Math.PI * dist) / hillRadius));
        }

        const isHovered = hoveredIdx === idx;
        const width = MIN_WIDTH + MAX_ADDITIONAL_WIDTH * intensity;
        const effectiveWidth = isHovered ? Math.max(width, 16) : width;
        const baseOpacity = 0.2 + 0.8 * intensity;
        const effectiveOpacity = isHovered ? Math.max(baseOpacity, 0.85) : baseOpacity;

        const tickRatio = idx / (TOTAL_TICKS - 1);
        const tickPercentage = Math.round(tickRatio * 100);

        return (
          <button
            key={idx}
            type="button"
            onClick={() => onScrollToRatio(tickRatio)}
            onMouseEnter={() => setHoveredIdx(idx)}
            onMouseLeave={() => setHoveredIdx(null)}
            aria-label={`Cuộn đến vị trí ${tickPercentage}%`}
            className="py-0.5 flex items-center justify-end rounded-xs cursor-pointer group/tick"
          >
            <span
              style={{
                width: `${effectiveWidth.toFixed(1)}px`,
                opacity: Number(effectiveOpacity.toFixed(3)),
              }}
              className="block h-[1px] bg-fg transition-[width,opacity] duration-100 ease-out"
            />
          </button>
        );
      })}
    </nav>
  );
}

/* ------------------------------------------------------------------ *
 * Main Landing Page Component                                        *
 * ------------------------------------------------------------------ */

/**
 * Public landing page for Trendifest (`/`). Presents the Vietnamese-first
 * topic graph, interactive dual-view workspace preview, Emergence Score
 * breakdown, and bounded public-source architecture.
 */
export function LandingPage({ onOpenApp }: LandingPageProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [previewWindow, setPreviewWindow] = useState<WindowKey>("7d");
  const [previewView, setPreviewView] = useState<PreviewView>("graph");
  const [selectedTopicId, setSelectedTopicId] = useState<string>("metro-ben-thanh");
  const [hoveredTopicId, setHoveredTopicId] = useState<string | null>(null);
  const [activePipelineStep, setActivePipelineStep] = useState<number>(0);
  const [scoreScenarioId, setScoreScenarioId] = useState<string>("cross-source-surge");
  const [activeUseCase, setActiveUseCase] = useState<string>("editorial");
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactSubmitted, setContactSubmitted] = useState(false);
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    const lenis = new Lenis({
      autoRaf: true,
      lerp: 0.1,
      anchors: { offset: -64 },
      respectReducedMotion: true,
    });
    lenisRef.current = lenis;
    return () => {
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  useEffect(() => {
    const lenis = lenisRef.current;
    if (!lenis) return;
    if (contactModalOpen) {
      lenis.stop();
    } else {
      lenis.start();
    }
  }, [contactModalOpen]);

  const windowSnapshot = PREVIEW_WINDOWS[previewWindow];
  const selectedTopic = useMemo(
    () =>
      windowSnapshot.topics.find((topic) => topic.id === selectedTopicId) ??
      windowSnapshot.topics[0],
    [windowSnapshot, selectedTopicId],
  );
  const focusedTopicId = hoveredTopicId ?? selectedTopic.id;
  const focusedTopic = useMemo(
    () =>
      windowSnapshot.topics.find((topic) => topic.id === focusedTopicId) ??
      windowSnapshot.topics[0],
    [windowSnapshot, focusedTopicId],
  );
  const scoreScenario = useMemo(
    () => SCORE_SCENARIOS.find((s) => s.id === scoreScenarioId) ?? SCORE_SCENARIOS[2],
    [scoreScenarioId],
  );
  const currentUseCase = useMemo(
    () => USE_CASES.find((item) => item.id === activeUseCase) ?? USE_CASES[0],
    [activeUseCase],
  );

  const scrollToRatio = (ratio: number) => {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    if (maxScroll <= 0) return;
    const targetY = Math.min(1, Math.max(0, ratio)) * maxScroll;
    if (lenisRef.current) {
      lenisRef.current.scrollTo(targetY);
      return;
    }
    window.scrollTo({ top: targetY, behavior: reduceMotion ? "auto" : "smooth" });
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-canvas text-fg [font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe_UI',Roboto,sans-serif] antialiased text-[15px] leading-6">
        <SideScrollRuler onScrollToRatio={scrollToRatio} />
        {/* ------------------------------------------------------------ */}
        {/* 1. Navigation Bar                                            */}
        {/* ------------------------------------------------------------ */}
        <header className="sticky top-0 z-40 border-b border-line bg-canvas/90 backdrop-blur-sm">
          <div className="max-w-[1200px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
            <a
              href="#"
              className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight text-fg shrink-0"
            >
              <BrandMark />
              <span>Trendifest</span>
            </a>

            <nav
              aria-label="Điều hướng chính"
              className="hidden md:flex items-center gap-6 text-[13.5px] text-fg-2"
            >
              <a href="#sources" className="hover:text-fg transition-colors duration-150">
                Nguồn dữ liệu
              </a>
              <a href="#pipeline" className="hover:text-fg transition-colors duration-150">
                Quy trình
              </a>
              <a href="#scoring" className="hover:text-fg transition-colors duration-150">
                Điểm nổi lên
              </a>
              <a href="#compliance" className="hover:text-fg transition-colors duration-150">
                Pháp lý
              </a>
              <a href="#faq" className="hover:text-fg transition-colors duration-150">
                Hỏi đáp
              </a>
            </nav>

            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <ThemeToggle
                className="size-8 rounded-lg text-fg-2 hover:text-fg hover:bg-hover transition-colors duration-150"
                iconClassName="size-4"
                start="top-down"
              />
              <button
                type="button"
                onClick={() => setContactModalOpen(true)}
                className="hidden sm:inline-flex items-center h-8 px-3 text-[13.5px] font-medium text-fg-2 hover:text-fg transition-colors duration-150"
              >
                Liên hệ
              </button>
              <button
                type="button"
                onClick={onOpenApp}
                className="inline-flex items-center gap-1.5 h-8 ps-3.5 pe-3 rounded-lg bg-inverse hover:bg-inverse-hover text-inverse-fg text-[13.5px] font-medium transition-[background-color,transform] duration-150 ease-out enabled:active:scale-[0.96]"
              >
                <span>Mở đồ thị</span>
                <ArrowRight className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setMobileMenuOpen((prev) => !prev)}
                aria-label="Mở menu điều hướng"
                aria-expanded={mobileMenuOpen}
                className="md:hidden inline-flex items-center justify-center size-8 rounded-lg border border-line bg-surface text-fg-2 hover:text-fg transition-colors duration-150"
              >
                {mobileMenuOpen ? (
                  <X className="size-4" strokeWidth={1.5} />
                ) : (
                  <Menu className="size-4" strokeWidth={1.5} />
                )}
              </button>
            </div>
          </div>

          <AnimatePresence>
            {mobileMenuOpen && (
              <motion.div
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: EASE_OUT }}
                className="md:hidden border-t border-line bg-surface px-4 py-3 space-y-1"
              >
                {[
                  { href: "#sources", label: "Nguồn dữ liệu" },
                  { href: "#pipeline", label: "Quy trình" },
                  { href: "#scoring", label: "Điểm nổi lên" },
                  { href: "#compliance", label: "Pháp lý" },
                  { href: "#faq", label: "Hỏi đáp" },
                ].map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="block rounded-lg px-3 py-2 text-[14px] text-fg-2 hover:bg-hover hover:text-fg transition-colors duration-150"
                  >
                    {item.label}
                  </a>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setContactModalOpen(true);
                  }}
                  className="block w-full text-left rounded-lg px-3 py-2 text-[14px] text-fg-2 hover:bg-hover hover:text-fg transition-colors duration-150"
                >
                  Liên hệ trao đổi
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </header>

        <main>
          {/* ------------------------------------------------------------ */}
          {/* 2. Hero: Cartographic Split Header + Live Dual-View Preview  */}
          {/* ------------------------------------------------------------ */}
          <section className="pt-10 sm:pt-12 pb-16 sm:pb-20 px-4 sm:px-6 border-b border-line">
            <div className="max-w-[1200px] mx-auto">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-end mb-8 sm:mb-10">
                {/* Left 7 columns: Headline + Lead + Actions */}
                <div className="lg:col-span-7">
                  <motion.h1
                    initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.34, ease: EASE_OUT }}
                    className="text-[34px] sm:text-[46px] font-medium tracking-[-0.02em] text-fg leading-[1.1] text-balance mb-4"
                  >
                    Bản đồ chủ đề tiếng Việt từ thảo luận cộng đồng và báo chí
                  </motion.h1>
                  <motion.div
                    initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: reduceMotion ? 0 : 0.06, ease: EASE_OUT }}
                  >
                    <p className="text-[16px] sm:text-[17px] text-fg-2 leading-[1.55] text-pretty max-w-2xl mb-6">
                      Thu thập trích đoạn công khai từ VOZ, Otofun cùng sáu đầu báo lớn, nhúng
                      vector cục bộ để gom nhóm sự kiện và giữ nguyên liên kết kiểm chứng về bài
                      gốc.
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={onOpenApp}
                        className="inline-flex items-center justify-center gap-2 h-11 ps-5 pe-4 rounded-lg bg-inverse hover:bg-inverse-hover text-inverse-fg text-[14px] font-medium transition-[background-color,transform] duration-150 ease-out enabled:active:scale-[0.96]"
                      >
                        <span>Mở đồ thị trực tiếp</span>
                        <ArrowRight className="size-4" strokeWidth={1.75} aria-hidden="true" />
                      </button>
                      <a
                        href="#scoring"
                        className="inline-flex items-center justify-center h-11 px-5 rounded-lg bg-surface hover:bg-hover text-fg border border-line text-[14px] font-medium transition-[background-color,transform] duration-150 ease-out active:scale-[0.96]"
                      >
                        Xem cách chấm điểm
                      </a>
                    </div>
                  </motion.div>
                </div>

                {/* Right 5 columns: Architectural Spec Grid (no rounded cards) */}
                <motion.div
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: reduceMotion ? 0 : 0.11, ease: EASE_OUT }}
                  className="lg:col-span-5 lg:border-l border-line lg:ps-8"
                >
                  <div className="grid grid-cols-2 border-t border-line">
                    {HERO_SPECS.map((spec, idx) => (
                      <div
                        key={spec.label}
                        className={cn(
                          "py-3.5 border-b border-line",
                          idx % 2 === 0 ? "pe-4 border-r border-line" : "ps-4",
                        )}
                      >
                        <div className="font-mono text-[22px] sm:text-[24px] font-medium text-fg tabular-nums leading-none">
                          {spec.value}
                          {spec.unit && (
                            <span className="font-sans text-[14px] font-normal text-fg-2 ms-1.5">
                              {spec.unit}
                            </span>
                          )}
                        </div>
                        <div className="text-[13px] font-medium text-fg-2 mt-1.5">{spec.label}</div>
                        <div className="text-[12px] text-fg-3 mt-0.5">{spec.note}</div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              </div>

              {/* ---------------------------------------------------------- */}
              {/* Product Moment: Interactive Dual-View Workspace Preview    */}
              {/* Concentric radii: outer rounded-2xl (16px) + p-2 (8px)     */}
              {/* -> inner rounded-lg (8px)                                  */}
              {/* ---------------------------------------------------------- */}
              <motion.div
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.34, delay: reduceMotion ? 0 : 0.15, ease: EASE_OUT }}
                aria-label="Xem trước bàn làm việc Trendifest"
                className="landing-frame rounded-2xl bg-sunken p-2"
              >
                <div className="rounded-lg border border-line bg-surface overflow-hidden">
                  {/* Workspace Header Toolbar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b border-line bg-canvas">
                    <div className="flex flex-wrap items-center gap-3">
                      {/* Interactive Graph / Board Switcher */}
                      <div
                        role="tablist"
                        aria-label="Chế độ xem bàn làm việc"
                        className="inline-flex items-center rounded-lg border border-line bg-surface p-0.5 gap-0.5"
                      >
                        <button
                          type="button"
                          role="tab"
                          aria-selected={previewView === "graph"}
                          onClick={() => setPreviewView("graph")}
                          className={cn(
                            "relative inline-flex items-center gap-1.5 px-2.5 h-7 rounded-md text-[12.5px] font-medium transition-colors duration-150",
                            previewView === "graph" ? "text-fg" : "text-fg-3 hover:text-fg",
                          )}
                        >
                          {previewView === "graph" && (
                            <motion.span
                              layoutId="preview-view-pill"
                              transition={SPRING_LAYOUT}
                              className="absolute inset-0 rounded-md bg-active"
                              aria-hidden="true"
                            />
                          )}
                          <Network
                            className="relative z-10 size-3.5"
                            strokeWidth={1.5}
                            aria-hidden="true"
                          />
                          <span className="relative z-10">Trend graph</span>
                        </button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={previewView === "board"}
                          onClick={() => setPreviewView("board")}
                          className={cn(
                            "relative inline-flex items-center gap-1.5 px-2.5 h-7 rounded-md text-[12.5px] font-medium transition-colors duration-150",
                            previewView === "board" ? "text-fg" : "text-fg-3 hover:text-fg",
                          )}
                        >
                          {previewView === "board" && (
                            <motion.span
                              layoutId="preview-view-pill"
                              transition={SPRING_LAYOUT}
                              className="absolute inset-0 rounded-md bg-active"
                              aria-hidden="true"
                            />
                          )}
                          <ListOrdered
                            className="relative z-10 size-3.5"
                            strokeWidth={1.5}
                            aria-hidden="true"
                          />
                          <span className="relative z-10">Topic board</span>
                        </button>
                      </div>

                      <span className="font-mono text-[12px] text-fg-3 tabular-nums whitespace-nowrap">
                        {windowSnapshot.topicCount} · {windowSnapshot.linkCount}
                      </span>
                    </div>

                    {/* Authentic sliding Observation Window control from src/styles.css */}
                    <div
                      role="group"
                      aria-label="Khung thời gian quan sát"
                      style={
                        {
                          "--window-index": WINDOW_INDEX[previewWindow],
                        } as CSSProperties
                      }
                      className="observation-window"
                    >
                      <span className="observation-indicator" aria-hidden="true" />
                      {(["24h", "3d", "7d"] as const).map((win) => (
                        <button
                          key={win}
                          type="button"
                          onClick={() => setPreviewWindow(win)}
                          aria-pressed={previewWindow === win}
                          className="observation-option h-7 rounded-md text-[12px] font-mono tabular-nums transition-colors duration-150"
                        >
                          {win}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Workspace 3-Column Body */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[400px]">
                    {/* Left Sidebar */}
                    <aside className="hidden lg:flex lg:col-span-3 flex-col justify-between border-r border-line bg-canvas p-4">
                      <div className="space-y-5">
                        <div>
                          <div className="text-[12px] font-medium text-fg-3 px-2.5 mb-1.5">
                            Chế độ xem
                          </div>
                          <ul className="space-y-0.5 text-[13px]">
                            <li>
                              <button
                                type="button"
                                onClick={() => setPreviewView("graph")}
                                className={cn(
                                  "w-full flex items-center gap-2.5 px-2.5 h-8 rounded-lg transition-colors duration-150",
                                  previewView === "graph"
                                    ? "bg-active text-fg font-medium"
                                    : "text-fg-2 hover:bg-hover hover:text-fg",
                                )}
                              >
                                <Network className="size-4 text-fg-3" strokeWidth={1.5} />
                                <span>Trend graph</span>
                              </button>
                            </li>
                            <li>
                              <button
                                type="button"
                                onClick={() => setPreviewView("board")}
                                className={cn(
                                  "w-full flex items-center gap-2.5 px-2.5 h-8 rounded-lg transition-colors duration-150",
                                  previewView === "board"
                                    ? "bg-active text-fg font-medium"
                                    : "text-fg-2 hover:bg-hover hover:text-fg",
                                )}
                              >
                                <ListOrdered className="size-4 text-fg-3" strokeWidth={1.5} />
                                <span>Topic board</span>
                              </button>
                            </li>
                            <li className="flex items-center gap-2.5 px-2.5 h-8 rounded-lg text-fg-2">
                              <Bell className="size-4 text-fg-3" strokeWidth={1.5} />
                              <span>Watchlists & alerts</span>
                            </li>
                          </ul>
                        </div>

                        <div>
                          <div className="text-[12px] font-medium text-fg-3 px-2.5 mb-1.5">
                            Nguồn đang lọc
                          </div>
                          <ul className="space-y-0.5 text-[13px] text-fg-2">
                            {[
                              { name: "Tất cả nguồn", count: "2.564" },
                              { name: "VOZ · Cộng đồng", count: "184" },
                              { name: "Otofun · Cộng đồng", count: "112" },
                              { name: "VnExpress · Báo chí", count: "628" },
                              { name: "Tuổi Trẻ · Báo chí", count: "590" },
                              { name: "Thanh Niên · Báo chí", count: "542" },
                              { name: "Dân trí · Báo chí", count: "508" },
                            ].map((row, idx) => (
                              <li
                                key={row.name}
                                className={cn(
                                  "flex items-center justify-between px-2.5 h-7 rounded-lg",
                                  idx === 0 && "bg-hover text-fg font-medium",
                                )}
                              >
                                <span className="truncate">{row.name}</span>
                                <span className="font-mono text-[12px] text-fg-3 tabular-nums">
                                  {row.count}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-line text-[12px] text-fg-3 px-2.5">
                        Suy luận cục bộ · {windowSnapshot.windowLabel}
                      </div>
                    </aside>

                    {/* Center Area: Switches cleanly between Interactive Ego Graph & Topic Board */}
                    <div className="lg:col-span-5 bg-surface flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-line overflow-hidden">
                      <AnimatePresence mode="popLayout" initial={false}>
                        {previewView === "graph" ? (
                          <motion.div
                            key="view-graph"
                            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.985 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.985 }}
                            transition={{ duration: 0.18, ease: EASE_OUT }}
                            className="flex flex-col justify-between h-full p-4"
                          >
                            <div className="flex items-center justify-between gap-3 text-[12px] text-fg-3">
                              <span>Di chuột hoặc nhấp nốt để soi mạng liên kết</span>
                              <span className="font-mono whitespace-nowrap shrink-0">E5-small</span>
                            </div>

                            <svg
                              viewBox="0 0 480 244"
                              className="w-full h-56 sm:h-64 select-none"
                              role="img"
                              aria-label="Đồ thị các cụm chủ đề và liên kết ngữ nghĩa đo được"
                              onMouseLeave={() => setHoveredTopicId(null)}
                            >
                              {/* Legitimate isolate background nodes */}
                              {[
                                { cx: 56, cy: 48, r: 4.5 },
                                { cx: 88, cy: 214, r: 5 },
                                { cx: 432, cy: 190, r: 4.5 },
                                { cx: 128, cy: 66, r: 4 },
                                { cx: 438, cy: 48, r: 4 },
                                { cx: 248, cy: 38, r: 3.5 },
                              ].map((iso, idx) => (
                                <circle
                                  key={idx}
                                  cx={iso.cx}
                                  cy={iso.cy}
                                  r={iso.r}
                                  className="fill-fg-4 transition-opacity duration-150"
                                  opacity={hoveredTopicId ? 0.16 : 0.38}
                                />
                              ))}

                              {/* Secondary detached pair */}
                              <g
                                className="transition-opacity duration-150"
                                opacity={hoveredTopicId ? 0.18 : 0.65}
                              >
                                <line
                                  x1="64"
                                  y1="112"
                                  x2="112"
                                  y2="132"
                                  className="stroke-line-strong"
                                  strokeWidth="1"
                                />
                                <circle cx="64" cy="112" r="6" className="fill-fg-3" />
                                <circle cx="112" cy="132" r="7" className="fill-fg-3" />
                              </g>

                              {/* Measured semantic links with ego-network focus */}
                              {PREVIEW_EDGES.map((edge) => {
                                const nodeA = windowSnapshot.topics.find((t) => t.id === edge.a);
                                const nodeB = windowSnapshot.topics.find((t) => t.id === edge.b);
                                if (!nodeA || !nodeB) return null;
                                const connectedToFocus =
                                  edge.a === focusedTopic.id || edge.b === focusedTopic.id;

                                return (
                                  <g key={`${edge.a}-${edge.b}`}>
                                    <line
                                      x1={nodeA.cx}
                                      y1={nodeA.cy}
                                      x2={nodeB.cx}
                                      y2={nodeB.cy}
                                      stroke={
                                        connectedToFocus
                                          ? "var(--graph-node-focused)"
                                          : "var(--graph-line)"
                                      }
                                      strokeOpacity={connectedToFocus ? 0.65 : 0.2}
                                      strokeWidth={connectedToFocus ? 1.75 : 1}
                                      className="transition-[stroke-opacity,stroke-width] duration-150"
                                    />
                                    {connectedToFocus && (
                                      <text
                                        x={edge.lx}
                                        y={edge.ly}
                                        textAnchor="middle"
                                        className="fill-fg-2 font-mono text-[10px]"
                                        style={{
                                          paintOrder: "stroke",
                                          stroke: "var(--surface)",
                                          strokeWidth: "3px",
                                        }}
                                      >
                                        {edge.sim}
                                      </text>
                                    )}
                                  </g>
                                );
                              })}

                              {/* Interactive topic nodes */}
                              {windowSnapshot.topics.map((topic, index) => {
                                const isSelected = topic.id === selectedTopic.id;
                                const isFocused = topic.id === focusedTopic.id;
                                const isNeighbor = focusedTopic.neighbors.includes(topic.id);
                                const dimmed = !isFocused && !isNeighbor;

                                return (
                                  <g
                                    key={topic.id}
                                    onClick={() => setSelectedTopicId(topic.id)}
                                    onMouseEnter={() => setHoveredTopicId(topic.id)}
                                    className="cursor-pointer transition-opacity duration-150"
                                    opacity={dimmed ? 0.35 : 1}
                                    role="button"
                                    tabIndex={0}
                                    aria-label={`Chọn chủ đề ${topic.title}`}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        setSelectedTopicId(topic.id);
                                      }
                                    }}
                                  >
                                    {isSelected && (
                                      <motion.circle
                                        cx={topic.cx}
                                        cy={topic.cy}
                                        animate={{ r: topic.r + 5 }}
                                        transition={SPRING_LAYOUT}
                                        fill="none"
                                        stroke="var(--graph-node-focused)"
                                        strokeOpacity="0.45"
                                        strokeWidth="1.5"
                                      />
                                    )}
                                    <motion.circle
                                      cx={topic.cx}
                                      cy={topic.cy}
                                      animate={{ r: topic.r }}
                                      transition={SPRING_LAYOUT}
                                      fill={
                                        isSelected
                                          ? "var(--graph-node-focused)"
                                          : index === 1
                                            ? "color-mix(in srgb, var(--graph-node) 45%, var(--graph-node-focused) 55%)"
                                            : "var(--graph-node)"
                                      }
                                      stroke="var(--surface)"
                                      strokeWidth="2"
                                    />
                                    <text
                                      x={topic.cx}
                                      y={topic.cy + topic.r + 15}
                                      textAnchor="middle"
                                      className={cn(
                                        "text-[11px] font-medium",
                                        isFocused ? "fill-fg" : "fill-fg-2",
                                      )}
                                      style={{
                                        paintOrder: "stroke",
                                        stroke: "var(--surface)",
                                        strokeWidth: "3px",
                                      }}
                                    >
                                      {topic.shortLabel}
                                    </text>
                                  </g>
                                );
                              })}
                            </svg>

                            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-line text-[12px] text-fg-3">
                              <div className="flex items-center gap-4">
                                <span className="inline-flex items-center gap-1.5">
                                  <span
                                    className="size-2 rounded-sm"
                                    style={{ backgroundColor: "var(--graph-node-focused)" }}
                                  />
                                  <span>Nhiều liên kết</span>
                                </span>
                                <span className="inline-flex items-center gap-1.5">
                                  <span
                                    className="size-2 rounded-sm"
                                    style={{ backgroundColor: "var(--graph-node)" }}
                                  />
                                  <span>Ít liên kết</span>
                                </span>
                              </div>
                              <span className="font-mono text-[12px]">
                                Kích thước = Điểm nổi lên
                              </span>
                            </div>
                          </motion.div>
                        ) : (
                          /* Interactive Topic Board view inside preview */
                          <motion.div
                            key="view-board"
                            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.985 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.985 }}
                            transition={{ duration: 0.18, ease: EASE_OUT }}
                            className="flex flex-col h-full"
                          >
                            <div className="grid grid-cols-12 gap-2 px-4 py-2.5 border-b border-line bg-canvas text-[12px] font-medium text-fg-3">
                              <div className="col-span-1">#</div>
                              <div className="col-span-6">Chủ đề</div>
                              <div className="col-span-3">Diễn biến</div>
                              <div className="col-span-2 text-right">Điểm</div>
                            </div>
                            <div className="divide-y divide-line flex-1">
                              {windowSnapshot.topics.map((topic) => {
                                const isSelected = topic.id === selectedTopic.id;
                                return (
                                  <button
                                    key={topic.id}
                                    type="button"
                                    onClick={() => setSelectedTopicId(topic.id)}
                                    className={cn(
                                      "w-full grid grid-cols-12 gap-2 px-4 py-3 text-left items-center transition-colors duration-150",
                                      isSelected ? "bg-active" : "hover:bg-hover",
                                    )}
                                  >
                                    <div className="col-span-1 font-mono text-[12px] text-fg-3 tabular-nums">
                                      {String(topic.rank).padStart(2, "0")}
                                    </div>
                                    <div className="col-span-6 min-w-0">
                                      <div className="text-[13px] font-medium text-fg truncate">
                                        {topic.title}
                                      </div>
                                      <div className="text-[12px] text-fg-3 tabular-nums mt-0.5">
                                        {topic.accounts} tài khoản · {topic.publishers} đầu báo
                                      </div>
                                    </div>
                                    <div className="col-span-3 flex items-center">
                                      <MiniSparkline points={topic.sparkPoints} />
                                    </div>
                                    <div className="col-span-2 text-right font-mono text-[13px] font-medium text-fg tabular-nums">
                                      {topic.potential}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                            <div className="px-4 py-2.5 border-t border-line text-[12px] text-fg-3">
                              Nhấp một hàng để mở bằng chứng chi tiết bên phải
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Right Evidence Inspector */}
                    <div className="lg:col-span-4 bg-canvas p-4 flex flex-col justify-between gap-4 overflow-hidden">
                      <AnimatePresence mode="popLayout" initial={false}>
                        <motion.div
                          key={`${previewWindow}:${selectedTopic.id}`}
                          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                          transition={{ duration: 0.18, ease: EASE_OUT }}
                          className="space-y-3.5"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <h2 className="text-[14px] font-medium text-fg leading-snug">
                              {selectedTopic.title}
                            </h2>
                            <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded bg-tone-green-soft text-tone-green font-mono text-[12px] font-medium tabular-nums">
                              {selectedTopic.potential}/100
                            </span>
                          </div>

                          <div className="grid grid-cols-3 gap-2 py-2.5 border-y border-line items-center">
                            <div>
                              <div className="text-[12px] text-fg-3">Tài khoản</div>
                              <div className="font-mono text-[14px] font-medium text-fg tabular-nums mt-0.5">
                                {selectedTopic.accounts}
                              </div>
                            </div>
                            <div>
                              <div className="text-[12px] text-fg-3">Đầu báo</div>
                              <div className="font-mono text-[14px] font-medium text-fg tabular-nums mt-0.5">
                                {selectedTopic.publishers}
                              </div>
                            </div>
                            <div className="flex flex-col items-end">
                              <div className="text-[12px] text-fg-3 mb-1">
                                {selectedTopic.phase}
                              </div>
                              <MiniSparkline points={selectedTopic.sparkPoints} animateDraw />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div className="text-[12px] font-medium text-fg-3">
                              Bằng chứng trích dẫn
                            </div>
                            {selectedTopic.examples.map((ex, i) => (
                              <div
                                key={i}
                                className="rounded-lg border border-line bg-surface p-3 space-y-1"
                              >
                                <div className="flex items-center justify-between gap-2 text-[12px]">
                                  <span className="font-medium text-fg">{ex.source}</span>
                                  <span className="text-fg-3">{ex.kind}</span>
                                </div>
                                <p className="text-[12px] text-fg-2 leading-[1.45] line-clamp-2">
                                  {ex.excerpt}
                                </p>
                                <div className="text-[12px] text-fg-3">{ex.time}</div>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      </AnimatePresence>

                      <button
                        type="button"
                        onClick={onOpenApp}
                        className="w-full h-9 ps-4 pe-3.5 rounded-lg border border-line bg-surface hover:bg-hover text-fg text-[13px] font-medium inline-flex items-center justify-center gap-1.5 transition-[background-color,transform] duration-150 ease-out enabled:active:scale-[0.96]"
                      >
                        <span>Mở trong không gian làm việc</span>
                        <ArrowUpRight className="size-4 text-fg-3" strokeWidth={1.5} />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </section>

          {/* ------------------------------------------------------------ */}
          {/* 3. Section 01: Real Sources (Hairline Grid, no box clutter)  */}
          {/* ------------------------------------------------------------ */}
          <section
            id="sources"
            className="scroll-mt-16 py-20 sm:py-24 px-4 sm:px-6 border-b border-line"
          >
            <div className="max-w-[1200px] mx-auto">
              <div className="flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-6 mb-10">
                <span className="font-mono text-[13px] text-fg-3 tabular-nums">01</span>
                <div className="max-w-2xl">
                  <h2 className="text-[28px] sm:text-[36px] font-medium tracking-[-0.02em] text-fg leading-[1.15] text-balance mb-3">
                    Tám nguồn công khai tiếng Việt, phân tách rõ vai trò
                  </h2>
                  <p className="text-[16px] text-fg-2 leading-[1.6] text-pretty">
                    Hệ thống thu thập theo chu kỳ có giới hạn (tối đa 500–1.000 bản ghi mỗi nguồn)
                    và không bao giờ gộp tin tức báo chí thành tài khoản cộng đồng hay lượt phản
                    hồi.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 border-y border-line lg:divide-x divide-line">
                {/* Community discussion */}
                <div className="lg:col-span-5 py-6 lg:pe-8 flex flex-col justify-between">
                  <div>
                    <h3 className="text-[16px] font-medium text-fg mb-2">
                      Thảo luận cộng đồng (2 diễn đàn)
                    </h3>
                    <p className="text-[14px] text-fg-2 leading-[1.6] mb-6">
                      Mỗi bài đăng gắn với một định danh tác giả theo nguồn. Mốc thời gian RSS được
                      ghi nhãn rõ là hoạt động diễn đàn, không suy đoán thành toàn bộ luồng bình
                      luận.
                    </p>
                  </div>

                  <div className="divide-y divide-line border-t border-line">
                    {COMMUNITY_SOURCES.map((src) => (
                      <div key={src.name} className="py-4 last:pb-0">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-[15px] font-medium text-fg">{src.name}</span>
                          <span className="font-mono text-[12px] text-fg-3">{src.endpoint}</span>
                        </div>
                        <p className="text-[13px] text-fg-3 mt-1">{src.note}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Publisher news matrix */}
                <div className="lg:col-span-7 border-t lg:border-t-0 border-line py-6 lg:ps-8">
                  <h3 className="text-[16px] font-medium text-fg mb-2">
                    Báo chí có nhãn nguồn (6 đầu báo, 53 luồng chuyên mục)
                  </h3>
                  <p className="text-[14px] text-fg-2 leading-[1.6] mb-6">
                    Hợp nhất bài viết trùng liên kết qua các chuyên mục và tái xác thực bằng ETag.
                    Tin bài được tính riêng ở cột đầu báo để tránh nhân bản giả tạo độ phủ cộng
                    đồng.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 border-t border-line">
                    {NEWS_SOURCES.map((src, idx) => (
                      <div
                        key={src.name}
                        className={cn(
                          "py-3.5 border-b border-line",
                          idx % 2 === 0 ? "sm:pe-6 sm:border-r border-line" : "sm:ps-6",
                        )}
                      >
                        <div className="text-[14px] font-medium text-fg">{src.name}</div>
                        <div className="text-[13px] text-fg-3 mt-0.5">{src.detail}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ------------------------------------------------------------ */}
          {/* 4. Section 02: Comparison Table                              */}
          {/* ------------------------------------------------------------ */}
          <section className="py-20 sm:py-24 px-4 sm:px-6 border-b border-line bg-sunken">
            <div className="max-w-[1200px] mx-auto">
              <div className="flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-6 mb-10">
                <span className="font-mono text-[13px] text-fg-3 tabular-nums">02</span>
                <div className="max-w-2xl">
                  <h2 className="text-[28px] sm:text-[36px] font-medium tracking-[-0.02em] text-fg leading-[1.15] text-balance mb-3">
                    Từ đếm từ khóa bề nổi sang gom cụm có kiểm chứng
                  </h2>
                  <p className="text-[16px] text-fg-2 leading-[1.6] text-pretty">
                    Thay vì gom mọi nguồn vào một bảng xếp hạng chung chung, Trendifest giữ nguyên
                    ngữ cảnh phát sinh và cấu trúc bằng chứng của từng chủ đề.
                  </p>
                </div>
              </div>

              <div className="border-y border-line bg-surface">
                <div className="hidden md:grid md:grid-cols-12 gap-6 px-6 py-3.5 border-b border-line bg-canvas text-[13px] font-medium text-fg-3">
                  <div className="col-span-3">Tiêu chí</div>
                  <div className="col-span-4">Công cụ từ khóa truyền thống</div>
                  <div className="col-span-5 text-fg">Cách làm của Trendifest</div>
                </div>
                <div className="divide-y divide-line">
                  {COMPARISON_ROWS.map((row) => (
                    <div
                      key={row.criteria}
                      className="grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-6 px-6 py-5 text-[14px] leading-[1.6] hover:bg-sunken/70 transition-colors duration-150"
                    >
                      <div className="md:col-span-3 font-medium text-fg">{row.criteria}</div>
                      <div className="md:col-span-4 text-fg-3">{row.traditional}</div>
                      <div className="md:col-span-5 text-fg-2">{row.trendifest}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ------------------------------------------------------------ */}
          {/* 5. Section 03: Local Processing Pipeline                     */}
          {/* ------------------------------------------------------------ */}
          <section
            id="pipeline"
            className="scroll-mt-16 py-20 sm:py-24 px-4 sm:px-6 border-b border-line"
          >
            <div className="max-w-[1200px] mx-auto">
              <div className="flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-6 mb-10">
                <span className="font-mono text-[13px] text-fg-3 tabular-nums">03</span>
                <div className="max-w-2xl">
                  <h2 className="text-[28px] sm:text-[36px] font-medium tracking-[-0.02em] text-fg leading-[1.15] text-balance mb-3">
                    Bốn bước xử lý từ bản ghi thô đến đồ thị chủ đề
                  </h2>
                  <p className="text-[16px] text-fg-2 leading-[1.6] text-pretty">
                    Toàn bộ khâu tính toán vector và phân cụm chạy tách biệt trong worker nền với
                    Postgres/pgvector, giữ cho luồng đọc giao diện luôn ổn định.
                  </p>
                </div>
              </div>

              <motion.div
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.12 }}
                transition={{ duration: 0.32, ease: EASE_OUT }}
                className="grid grid-cols-1 lg:grid-cols-12 border-y border-line lg:divide-x divide-line"
              >
                {/* Step selector rail */}
                <div className="lg:col-span-5 divide-y divide-line">
                  {PIPELINE_STEPS.map((item, idx) => {
                    const isActive = activePipelineStep === idx;
                    return (
                      <button
                        key={item.step}
                        type="button"
                        onClick={() => setActivePipelineStep(idx)}
                        aria-pressed={isActive}
                        className={cn(
                          "relative w-full text-left px-4 py-4 flex items-baseline gap-4 transition-colors duration-150",
                          isActive ? "bg-surface text-fg" : "hover:bg-sunken text-fg-2",
                        )}
                      >
                        {isActive && (
                          <motion.span
                            layoutId="pipeline-active-bar"
                            transition={SPRING_LAYOUT}
                            className="absolute inset-y-0 left-0 w-0.5"
                            style={{ backgroundColor: "var(--graph-node-focused)" }}
                            aria-hidden="true"
                          />
                        )}
                        <span
                          className="font-mono text-[13px] tabular-nums font-medium shrink-0"
                          style={{
                            color: isActive ? "var(--graph-node-focused)" : "var(--fg-3)",
                          }}
                        >
                          {item.step}
                        </span>
                        <span className="text-[15px] font-medium">{item.title}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Active step detail reader */}
                <div className="lg:col-span-7 bg-surface p-6 sm:p-8 flex flex-col justify-between gap-6 border-t lg:border-t-0 border-line overflow-hidden">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.div
                      key={activePipelineStep}
                      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                      transition={{ duration: 0.18, ease: EASE_OUT }}
                      className="flex flex-col justify-between gap-6 h-full"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-4 pb-4 mb-5 border-b border-line">
                          <div className="flex items-center gap-2 text-[13px] text-fg-3">
                            <Cpu className="size-4" strokeWidth={1.5} aria-hidden="true" />
                            <span className="font-mono tabular-nums">
                              Bước {PIPELINE_STEPS[activePipelineStep].step} / 04
                            </span>
                          </div>
                          <span className="font-mono text-[12px] text-fg-3">Local worker</span>
                        </div>
                        <h3 className="text-[20px] font-medium text-fg mb-3">
                          {PIPELINE_STEPS[activePipelineStep].title}
                        </h3>
                        <p className="text-[15px] text-fg-2 leading-[1.6] mb-3">
                          {PIPELINE_STEPS[activePipelineStep].summary}
                        </p>
                        <p className="text-[14px] text-fg-3 leading-[1.6]">
                          {PIPELINE_STEPS[activePipelineStep].detail}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-x-6 gap-y-2 pt-4 border-t border-line font-mono text-[12px] text-fg-3">
                        {PIPELINE_STEPS[activePipelineStep].specs.map((spec) => (
                          <span key={spec}>{spec}</span>
                        ))}
                      </div>
                    </motion.div>
                  </AnimatePresence>
                </div>
              </motion.div>
            </div>
          </section>

          {/* ------------------------------------------------------------ */}
          {/* 6. Section 04: Interactive Emergence Score Simulator         */}
          {/* ------------------------------------------------------------ */}
          <section
            id="scoring"
            className="scroll-mt-16 py-20 sm:py-24 px-4 sm:px-6 border-b border-line bg-sunken"
          >
            <div className="max-w-[1200px] mx-auto">
              <div className="flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-6 mb-10">
                <span className="font-mono text-[13px] text-fg-3 tabular-nums">04</span>
                <div className="max-w-2xl">
                  <h2 className="text-[28px] sm:text-[36px] font-medium tracking-[-0.02em] text-fg leading-[1.15] text-balance mb-3">
                    Cấu trúc Điểm nổi lên (Emergence Score)
                  </h2>
                  <p className="text-[16px] text-fg-2 leading-[1.6] text-pretty">
                    Thử chuyển qua ba kịch bản thu thập thực tế để xem năm thành phần trọng số và hệ
                    số tin cậy{" "}
                    <span className="font-mono text-[14px] text-fg">
                      0.3 + 0.7 × min(1, (tài khoản + đầu báo) / 5)
                    </span>{" "}
                    tạo nên điểm số từ 0 đến 100.
                  </p>
                </div>
              </div>

              <motion.div
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.12 }}
                transition={{ duration: 0.32, ease: EASE_OUT }}
                className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
              >
                {/* Left 7 columns: Interactive Score Simulator */}
                <div className="lg:col-span-7 landing-frame rounded-xl bg-surface p-6 sm:p-8">
                  {/* Scenario switcher */}
                  <div
                    role="tablist"
                    aria-label="Kịch bản minh họa điểm nổi lên"
                    className="flex flex-wrap gap-2 pb-5 mb-6 border-b border-line"
                  >
                    {SCORE_SCENARIOS.map((sc) => {
                      const active = sc.id === scoreScenario.id;
                      return (
                        <button
                          key={sc.id}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          onClick={() => setScoreScenarioId(sc.id)}
                          className={cn(
                            "relative h-8 px-3 rounded-lg text-[13px] font-medium border transition-colors duration-150",
                            active
                              ? "text-inverse-fg border-transparent"
                              : "bg-canvas text-fg-2 border-line hover:text-fg hover:bg-hover",
                          )}
                        >
                          {active && (
                            <motion.span
                              layoutId="score-scenario-pill"
                              transition={SPRING_LAYOUT}
                              className="absolute inset-0 rounded-[7px] bg-inverse"
                              aria-hidden="true"
                            />
                          )}
                          <span className="relative z-10">{sc.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Computed figures row */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-6 mb-6 border-b border-line">
                    <div>
                      <div className="text-[12px] text-fg-3">Điểm tổng hợp</div>
                      <div className="font-mono text-[26px] font-medium text-fg tabular-nums leading-tight mt-1 flex items-baseline">
                        <span className="inline-flex overflow-hidden relative h-[32px]">
                          <AnimatePresence mode="popLayout" initial={false}>
                            <motion.span
                              key={scoreScenario.score}
                              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
                              transition={SPRING_SWAP}
                            >
                              {scoreScenario.score}
                            </motion.span>
                          </AnimatePresence>
                        </span>
                        <span className="text-[14px] text-fg-3">/100</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-[12px] text-fg-3">Hệ số tin cậy</div>
                      <div className="font-mono text-[20px] font-medium text-fg tabular-nums leading-tight mt-2">
                        {scoreScenario.multiplier}
                      </div>
                    </div>
                    <div>
                      <div className="text-[12px] text-fg-3">Tài khoản độc lập</div>
                      <div className="font-mono text-[20px] font-medium text-fg tabular-nums leading-tight mt-2">
                        {scoreScenario.accounts}
                      </div>
                    </div>
                    <div>
                      <div className="text-[12px] text-fg-3">Đầu báo</div>
                      <div className="font-mono text-[20px] font-medium text-fg tabular-nums leading-tight mt-2">
                        {scoreScenario.publishers}
                      </div>
                    </div>
                  </div>

                  {/* GPU-composited scaleX weighted bars */}
                  <div className="space-y-4">
                    {scoreScenario.bars.map((bar) => (
                      <div key={bar.name}>
                        <div className="flex items-baseline justify-between gap-4 mb-1.5">
                          <span className="text-[13.5px] font-medium text-fg">{bar.name}</span>
                          <span className="font-mono text-[12.5px] text-fg-2 tabular-nums">
                            {bar.fill}/100
                          </span>
                        </div>
                        <div className="h-2 w-full rounded bg-canvas border border-line overflow-hidden mb-1">
                          <div
                            className="h-full w-full origin-left transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]"
                            style={{
                              transform: `scaleX(${bar.fill / 100})`,
                              backgroundColor: bar.accent
                                ? "var(--graph-node-focused)"
                                : "var(--fg-3)",
                            }}
                          />
                        </div>
                        <p className="text-[12.5px] text-fg-3">{bar.description}</p>
                      </div>
                    ))}
                  </div>

                  <p className="mt-6 pt-4 border-t border-line text-[13px] text-fg-2 leading-[1.55]">
                    {scoreScenario.note}
                  </p>
                </div>

                {/* Right 5 columns: Graph Reading Guide (hairline-divided, zero cards) */}
                <div className="lg:col-span-5 divide-y divide-line border-y border-line">
                  <div className="py-5 first:pt-2">
                    <h3 className="text-[15px] font-medium text-fg mb-1.5">Kích thước nốt</h3>
                    <p className="text-[14px] text-fg-2 leading-[1.6]">
                      Tỷ lệ thuận với điểm nổi lên. Nhiều bài viết độc lập cùng nói về một sự kiện
                      sẽ củng cố kích thước của một nốt duy nhất thay vì tạo ra các chấm rời rạc.
                    </p>
                  </div>

                  <div className="py-5">
                    <h3 className="text-[15px] font-medium text-fg mb-1.5">Màu sắc & cạnh nối</h3>
                    <p className="text-[14px] text-fg-2 leading-[1.6]">
                      Màu chạy từ trung tính sang tím khi số liên kết chủ đề tăng (tối đa 3 liên kết
                      mạnh nhất). Cạnh nối chỉ dùng làm ngữ cảnh, không cộng thêm điểm.
                    </p>
                  </div>

                  <div className="py-5">
                    <h3 className="text-[15px] font-medium text-fg mb-1.5">
                      Kiểm duyệt gộp & tách
                    </h3>
                    <p className="text-[14px] text-fg-2 leading-[1.6]">
                      Khóa tương thích thực thể và năm sự kiện khi gộp; cho phép tách bản ghi chọn
                      lọc và hoàn tác nếu chưa có thay đổi phụ thuộc mới hơn.
                    </p>
                  </div>

                  <div className="py-5 last:pb-2">
                    <h3 className="text-[15px] font-medium text-fg mb-1.5">Khởi động lạnh</h3>
                    <p className="text-[14px] text-fg-2 leading-[1.6]">
                      Thành phần Velocity luôn giữ trung tính cho đến khi có mẫu quan sát thực qua
                      hai cửa sổ 6 giờ liên tiếp không có khoảng trống quá 75 phút.
                    </p>
                  </div>
                </div>
              </motion.div>
            </div>
          </section>

          {/* ------------------------------------------------------------ */}
          {/* 7. Section 05: Use Cases & Legal Architecture                */}
          {/* ------------------------------------------------------------ */}
          <section
            id="use-cases"
            className="scroll-mt-16 py-20 sm:py-24 px-4 sm:px-6 border-b border-line"
          >
            <div className="max-w-[1200px] mx-auto">
              <div className="flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-6 mb-8">
                <span className="font-mono text-[13px] text-fg-3 tabular-nums">05</span>
                <div className="max-w-2xl">
                  <h2 className="text-[28px] sm:text-[36px] font-medium tracking-[-0.02em] text-fg leading-[1.15] text-balance mb-3">
                    Ứng dụng trong công việc hằng ngày
                  </h2>
                  <p className="text-[16px] text-fg-2 leading-[1.6] text-pretty">
                    Chọn góc nhìn phù hợp để xem cách bảng chủ đề, nhật ký kiểm duyệt và quy tắc
                    theo dõi vận hành cùng nhau.
                  </p>
                </div>
              </div>

              <div
                role="tablist"
                aria-label="Nhóm người dùng"
                className="flex flex-wrap gap-2 mb-8"
              >
                {USE_CASES.map((uc) => {
                  const isActive = uc.id === activeUseCase;
                  return (
                    <button
                      key={uc.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setActiveUseCase(uc.id)}
                      className={cn(
                        "relative h-9 px-4 rounded-lg text-[13.5px] font-medium border transition-colors duration-150",
                        isActive
                          ? "text-inverse-fg border-transparent"
                          : "bg-surface text-fg-2 border-line hover:text-fg hover:bg-hover",
                      )}
                    >
                      {isActive && (
                        <motion.span
                          layoutId="usecase-tab-pill"
                          transition={SPRING_LAYOUT}
                          className="absolute inset-0 rounded-[7px] bg-inverse"
                          aria-hidden="true"
                        />
                      )}
                      <span className="relative z-10">{uc.tab}</span>
                    </button>
                  );
                })}
              </div>

              <div className="border-y border-line py-8 overflow-hidden">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.div
                    key={currentUseCase.id}
                    initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
                    transition={{ duration: 0.2, ease: EASE_OUT }}
                    className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
                  >
                    <div className="lg:col-span-7">
                      <h3 className="text-[22px] font-medium text-fg leading-[1.25] mb-3">
                        {currentUseCase.headline}
                      </h3>
                      <p className="text-[15px] text-fg-2 leading-[1.6] mb-6">
                        {currentUseCase.description}
                      </p>
                      <ul className="space-y-3">
                        {currentUseCase.points.map((point) => (
                          <li
                            key={point}
                            className="flex items-start gap-2.5 text-[14px] text-fg-2 leading-[1.55]"
                          >
                            <Check
                              className="size-4 text-fg-3 shrink-0 mt-1"
                              strokeWidth={1.5}
                              aria-hidden="true"
                            />
                            <span>{point}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="lg:col-span-5 rounded-xl border border-line bg-surface p-5">
                      <div className="flex items-center justify-between pb-3 mb-3 border-b border-line">
                        <span className="text-[13px] font-medium text-fg">
                          {currentUseCase.artifactTitle}
                        </span>
                        <span className="font-mono text-[12px] text-fg-3">Mẫu giao diện</span>
                      </div>
                      <div className="divide-y divide-line">
                        {currentUseCase.artifactRows.map((row) => (
                          <div key={row.label} className="py-3 first:pt-1 last:pb-1">
                            <div className="flex items-baseline justify-between gap-3">
                              <span className="font-mono text-[12px] text-fg-3 tabular-nums">
                                {row.rank}
                              </span>
                              <span className="font-mono text-[12px] font-medium text-fg tabular-nums">
                                {row.score}
                              </span>
                            </div>
                            <div className="text-[14px] font-medium text-fg mt-1 leading-snug">
                              {row.label}
                            </div>
                            <div className="text-[12px] text-fg-3 mt-1">{row.meta}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </section>

          {/* ------------------------------------------------------------ */}
          {/* 8. Section 06: Legal & Local AI Strip (no boxes)             */}
          {/* ------------------------------------------------------------ */}
          <section
            id="compliance"
            className="scroll-mt-16 py-20 sm:py-24 px-4 sm:px-6 border-b border-line bg-sunken"
          >
            <div className="max-w-[1200px] mx-auto">
              <div className="flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-6 mb-10">
                <span className="font-mono text-[13px] text-fg-3 tabular-nums">06</span>
                <div className="max-w-2xl">
                  <h2 className="text-[28px] sm:text-[36px] font-medium tracking-[-0.02em] text-fg leading-[1.15] text-balance mb-3">
                    Thu thập có ranh giới và suy luận tại chỗ
                  </h2>
                  <p className="text-[16px] text-fg-2 leading-[1.6] text-pretty">
                    Thiết kế theo nguyên tắc ưu tiên cổng truy cập hợp lệ, không giữ HTML thô và
                    tách bạch rõ giới hạn mẫu ngay trong giao diện phân tích.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 border-y border-line md:divide-x divide-line">
                <div className="py-6 md:pe-8">
                  <h3 className="text-[16px] font-medium text-fg mb-2">
                    Đối chiếu Luật 91/2025/QH15
                  </h3>
                  <p className="text-[14px] text-fg-2 leading-[1.6] mb-4">
                    Thiết kế hướng tới tuân thủ Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15 và Nghị
                    định 356/2025/NĐ-CP.
                  </p>
                  <ul className="space-y-2 text-[13px] text-fg-3">
                    <li>Không suy đoán độ tuổi hay nhân khẩu học</li>
                    <li>Không gộp tài khoản chéo nền tảng thành một người</li>
                    <li>Chỉ xử lý văn bản công khai qua danh mục cấu hình</li>
                  </ul>
                </div>

                <div className="py-6 md:px-8 border-t md:border-t-0 border-line">
                  <h3 className="text-[16px] font-medium text-fg mb-2">
                    Cổng công khai có giới hạn
                  </h3>
                  <p className="text-[14px] text-fg-2 leading-[1.6] mb-4">
                    Mỗi phản hồi HTTP giới hạn tối đa 1 MB và thời hạn 15 giây, không thu thập lén
                    qua thách thức bảo mật.
                  </p>
                  <ul className="space-y-2 text-[13px] text-fg-3">
                    <li>Không lưu giữ mã nguồn HTML hay script của trang báo</li>
                    <li>Chỉ lấy ảnh đính kèm HTTPS từ đúng tên miền nguồn</li>
                    <li>Hiển thị lỗi từng chuyên mục thay vì ẩn thành nguồn rỗng</li>
                  </ul>
                </div>

                <div className="py-6 md:ps-8 border-t md:border-t-0 border-line">
                  <h3 className="text-[16px] font-medium text-fg mb-2">
                    Local AI & hết hạn 30 ngày
                  </h3>
                  <p className="text-[14px] text-fg-2 leading-[1.6] mb-4">
                    Trọng số mô hình tải về bộ nhớ đệm cục bộ; nội dung bài đăng không rời khỏi máy
                    chủ suy luận nội bộ.
                  </p>
                  <ul className="space-y-2 text-[13px] text-fg-3">
                    <li>Tự động xóa dữ liệu và vector dẫn xuất sau 30 ngày</li>
                    <li>Chỉnh sửa bài gốc tự động vô hiệu hóa vector cũ</li>
                    <li>Không suy diễn việc xóa bài từ danh sách RSS cuộn</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          {/* ------------------------------------------------------------ */}
          {/* 9. FAQ Accordion (smooth grid-row reveal)                    */}
          {/* ------------------------------------------------------------ */}
          <section
            id="faq"
            className="scroll-mt-16 py-20 sm:py-24 px-4 sm:px-6 border-b border-line"
          >
            <div className="max-w-3xl mx-auto">
              <h2 className="text-[28px] sm:text-[36px] font-medium tracking-[-0.02em] text-fg leading-[1.15] mb-10">
                Câu hỏi thường gặp
              </h2>

              <div className="divide-y divide-line border-y border-line">
                {FAQS.map((faq, idx) => {
                  const isOpen = openFaq === idx;
                  return (
                    <div key={faq.question} className="py-5">
                      <button
                        type="button"
                        onClick={() => setOpenFaq(isOpen ? null : idx)}
                        aria-expanded={isOpen}
                        className="flex items-center justify-between w-full text-left gap-4 text-fg hover:text-fg-2 transition-colors duration-150"
                      >
                        <span className="text-[16px] font-medium leading-[1.45]">
                          {faq.question}
                        </span>
                        <ChevronDown
                          className={cn(
                            "size-4 text-fg-3 shrink-0 transition-transform duration-150 ease-out",
                            isOpen && "rotate-180",
                          )}
                          strokeWidth={1.5}
                        />
                      </button>
                      <div className="landing-faq-body" data-open={isOpen}>
                        <div className="overflow-hidden">
                          <p className="pt-3 text-[14px] text-fg-2 leading-[1.6] pr-8">
                            {faq.answer}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* ------------------------------------------------------------ */}
          {/* 10. Closing Callout                                          */}
          {/* ------------------------------------------------------------ */}
          <section className="py-20 px-4 sm:px-6">
            <div className="max-w-[1200px] mx-auto landing-frame rounded-2xl bg-surface p-8 sm:p-12 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div className="max-w-xl">
                <h2 className="text-[24px] sm:text-[30px] font-medium tracking-[-0.02em] text-fg leading-[1.15] mb-3">
                  Bắt đầu khảo sát bản đồ chủ đề ngay trong trình duyệt
                </h2>
                <p className="text-[15px] text-fg-2 leading-[1.55] text-pretty">
                  Không cần đăng nhập hay cài đặt tiện ích bổ sung. Toàn bộ đồ thị, bảng xếp hạng và
                  quy tắc theo dõi hoạt động trực tiếp tại trang ứng dụng.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={onOpenApp}
                  className="inline-flex items-center justify-center gap-2 h-11 ps-5 pe-4 rounded-lg bg-inverse hover:bg-inverse-hover text-inverse-fg text-[14px] font-medium transition-[background-color,transform] duration-150 ease-out enabled:active:scale-[0.96]"
                >
                  <span>Mở đồ thị trực tiếp</span>
                  <ArrowRight className="size-4" strokeWidth={1.75} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setContactModalOpen(true)}
                  className="inline-flex items-center justify-center h-11 px-5 rounded-lg border border-line bg-canvas hover:bg-hover text-fg text-[14px] font-medium transition-[background-color,transform] duration-150 ease-out enabled:active:scale-[0.96]"
                >
                  Liên hệ trao đổi
                </button>
              </div>
            </div>
          </section>
        </main>

        {/* ------------------------------------------------------------ */}
        {/* 11. Footer                                                   */}
        {/* ------------------------------------------------------------ */}
        <footer className="border-t border-line bg-canvas py-14 px-4 sm:px-6 text-[13px] text-fg-3">
          <div className="max-w-[1200px] mx-auto grid grid-cols-1 md:grid-cols-12 gap-8 pb-10 border-b border-line">
            <div className="md:col-span-5 space-y-3">
              <div className="flex items-center gap-2.5 text-[15px] font-semibold text-fg">
                <BrandMark />
                <span>Trendifest</span>
              </div>
              <p className="max-w-sm leading-[1.6] text-fg-2">
                Không gian làm việc phân tích chủ đề tiếng Việt từ thảo luận diễn đàn và báo chí có
                nhãn nguồn, suy luận vector cục bộ và kiểm chứng minh bạch.
              </p>
            </div>

            <div className="md:col-span-2 space-y-2.5">
              <div className="font-medium text-fg">Sản phẩm</div>
              <ul className="space-y-2">
                <li>
                  <button
                    type="button"
                    onClick={onOpenApp}
                    className="hover:text-fg transition-colors duration-150"
                  >
                    Đồ thị chủ đề
                  </button>
                </li>
                <li>
                  <a href="#sources" className="hover:text-fg transition-colors duration-150">
                    Nguồn dữ liệu
                  </a>
                </li>
                <li>
                  <a href="#scoring" className="hover:text-fg transition-colors duration-150">
                    Điểm nổi lên
                  </a>
                </li>
              </ul>
            </div>

            <div className="md:col-span-2 space-y-2.5">
              <div className="font-medium text-fg">Nguyên tắc</div>
              <ul className="space-y-2">
                <li>
                  <a href="#pipeline" className="hover:text-fg transition-colors duration-150">
                    Suy luận cục bộ
                  </a>
                </li>
                <li>
                  <a href="#compliance" className="hover:text-fg transition-colors duration-150">
                    Luật 91/2025/QH15
                  </a>
                </li>
                <li>
                  <a href="#faq" className="hover:text-fg transition-colors duration-150">
                    Câu hỏi thường gặp
                  </a>
                </li>
              </ul>
            </div>

            <div className="md:col-span-3 space-y-2.5">
              <div className="font-medium text-fg">Liên hệ</div>
              <ul className="space-y-2">
                <li>
                  <a
                    href="mailto:hanhnguyen17122006@gmail.com"
                    className="hover:text-fg transition-colors duration-150"
                  >
                    hanhnguyen17122006@gmail.com
                  </a>
                </li>
                <li className="font-mono tabular-nums">0935 009 725</li>
                <li>Đà Nẵng, Việt Nam</li>
              </ul>
            </div>
          </div>

          <div className="max-w-[1200px] mx-auto pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            <span>Trendifest · Vietnamese topic workspace</span>
            <span>Mọi chỉ số đều gắn với bằng chứng quan sát được</span>
          </div>
        </footer>

        {/* ------------------------------------------------------------ */}
        {/* 12. Contact Modal (with overscroll-behavior: contain)        */}
        {/* ------------------------------------------------------------ */}
        <AnimatePresence>
          {contactModalOpen && (
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="contact-dialog-title"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: EASE_OUT }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-scrim overscroll-contain"
            >
              <motion.div
                data-lenis-prevent
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
                transition={reduceMotion ? { duration: 0.15 } : SPRING_PANEL}
                className="w-full max-w-md max-h-[90dvh] overflow-y-auto overscroll-contain rounded-xl border border-line bg-surface p-6 shadow-float relative"
              >
                <button
                  type="button"
                  onClick={() => {
                    setContactModalOpen(false);
                    setContactSubmitted(false);
                  }}
                  aria-label="Đóng hộp thoại"
                  className="absolute top-4 right-4 size-8 inline-flex items-center justify-center rounded-lg text-fg-3 hover:text-fg hover:bg-hover transition-colors duration-150"
                >
                  <X className="size-4" strokeWidth={1.5} />
                </button>

                <AnimatePresence mode="popLayout" initial={false}>
                  {!contactSubmitted ? (
                    <motion.div
                      key="contact-form"
                      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                      transition={{ duration: 0.16, ease: EASE_OUT }}
                    >
                      <h3
                        id="contact-dialog-title"
                        className="text-[18px] font-medium text-fg mb-2"
                      >
                        Liên hệ trao đổi về Trendifest
                      </h3>
                      <p className="text-[14px] text-fg-2 leading-[1.55] mb-5">
                        Để lại thông tin nếu bạn muốn trao đổi về triển khai cục bộ hoặc danh mục
                        nguồn tiếng Việt.
                      </p>

                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          setContactSubmitted(true);
                        }}
                        className="space-y-4"
                      >
                        <div>
                          <label className="block text-[13px] font-medium text-fg-2 mb-1.5">
                            Họ và tên
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="Trần Minh Anh"
                            className="w-full h-10 px-3 rounded-lg border border-line bg-canvas text-[16px] sm:text-[14px] text-fg placeholder:text-fg-3"
                          />
                        </div>
                        <div>
                          <label className="block text-[13px] font-medium text-fg-2 mb-1.5">
                            Email liên hệ
                          </label>
                          <input
                            type="email"
                            required
                            placeholder="minhanh@tochuc.vn"
                            className="w-full h-10 px-3 rounded-lg border border-line bg-canvas text-[16px] sm:text-[14px] text-fg placeholder:text-fg-3"
                          />
                        </div>
                        <div>
                          <label className="block text-[13px] font-medium text-fg-2 mb-1.5">
                            Nội dung quan tâm
                          </label>
                          <select className="w-full h-10 px-3 rounded-lg border border-line bg-canvas text-[16px] sm:text-[14px] text-fg">
                            <option>Triển khai máy chủ thu thập & nhúng cục bộ</option>
                            <option>Nghiên cứu chủ đề báo chí và diễn đàn tiếng Việt</option>
                            <option>Góp ý về bộ nguồn công khai hoặc thuật toán gom cụm</option>
                          </select>
                        </div>
                        <button
                          type="submit"
                          className="w-full h-10 rounded-lg bg-inverse hover:bg-inverse-hover text-inverse-fg text-[14px] font-medium transition-[background-color,transform] duration-150 ease-out enabled:active:scale-[0.96]"
                        >
                          Gửi thông tin
                        </button>
                      </form>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="contact-done"
                      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                      transition={{ duration: 0.16, ease: EASE_OUT }}
                      className="py-4"
                    >
                      <h3
                        id="contact-dialog-title"
                        className="text-[18px] font-medium text-fg mb-2"
                      >
                        Đã ghi nhận thông tin
                      </h3>
                      <p className="text-[14px] text-fg-2 leading-[1.55] mb-5">
                        Cảm ơn bạn đã liên hệ. Đội ngũ phụ trách sẽ phản hồi qua email bạn đã cung
                        cấp.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setContactModalOpen(false);
                          setContactSubmitted(false);
                        }}
                        className="h-9 px-4 rounded-lg border border-line bg-canvas hover:bg-hover text-fg text-[14px] font-medium transition-colors duration-150"
                      >
                        Đóng
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
