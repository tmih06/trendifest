import ArrowRight from "lucide-react/icons/arrow-right";
import ArrowUpRight from "lucide-react/icons/arrow-up-right";
import Bell from "lucide-react/icons/bell";
import Check from "lucide-react/icons/check";
import ChevronDown from "lucide-react/icons/chevron-down";
import Cpu from "lucide-react/icons/cpu";
import Database from "lucide-react/icons/database";
import FileText from "lucide-react/icons/file-text";
import GitMerge from "lucide-react/icons/git-merge";
import Layers from "lucide-react/icons/layers";
import ListOrdered from "lucide-react/icons/list-ordered";
import Lock from "lucide-react/icons/lock";
import Menu from "lucide-react/icons/menu";
import MessageSquare from "lucide-react/icons/message-square";
import Network from "lucide-react/icons/network";
import ShieldCheck from "lucide-react/icons/shield-check";
import X from "lucide-react/icons/x";
import { useMemo, useState } from "react";
import { cn } from "@trendifest/opendesk";
import { ThemeToggle } from "@/components/motion/theme-toggle";

export interface LandingPageProps {
  onOpenApp: () => void;
}

/* ------------------------------------------------------------------ *
 * Grounded domain data (mirrors README.md & shared/segments.ts)      *
 * ------------------------------------------------------------------ */

interface PreviewTopic {
  id: string;
  title: string;
  potential: number;
  phase: "Đang tăng" | "Duy trì" | "Hạ nhiệt";
  accounts: number;
  publishers: number;
  links: number;
  cx: number;
  cy: number;
  r: number;
  related: { id: string; label: string; similarity: string }[];
  examples: {
    source: string;
    kind: "Cộng đồng" | "Báo chí";
    byline: string;
    time: string;
    excerpt: string;
  }[];
}

type WindowKey = "24h" | "3d" | "7d";

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
        title: "Điều chỉnh lộ trình xe buýt kết nối tuyến Metro số 1",
        potential: 78,
        phase: "Đang tăng",
        accounts: 19,
        publishers: 4,
        links: 3,
        cx: 248,
        cy: 146,
        r: 18,
        related: [
          {
            id: "ve-lien-thong",
            label: "Đề xuất giá vé liên thông xe buýt – đường sắt đô thị",
            similarity: "0.824",
          },
          {
            id: "bai-gui-xe",
            label: "Bố trí bãi gửi xe cá nhân dọc nhà ga trên cao",
            similarity: "0.781",
          },
        ],
        examples: [
          {
            source: "VOZ",
            kind: "Cộng đồng",
            byline: "voz_member_418",
            time: "Hoạt động 2 giờ trước",
            excerpt:
              "Từ Thủ Đức đi vào trung tâm sáng nay có thêm tuyến gom mới, đỡ kẹt đoạn ngã tư Thủ Đức hơn hẳn.",
          },
          {
            source: "Tuổi Trẻ",
            kind: "Báo chí",
            byline: "Tuổi Trẻ",
            time: "Xuất bản 4 giờ trước",
            excerpt:
              "Trung tâm Quản lý Giao thông công cộng TP.HCM điều chỉnh lộ trình 17 tuyến buýt gom hành khách qua các ga.",
          },
        ],
      },
      {
        id: "ve-lien-thong",
        title: "Đề xuất giá vé liên thông xe buýt – đường sắt đô thị",
        potential: 64,
        phase: "Duy trì",
        accounts: 12,
        publishers: 3,
        links: 2,
        cx: 386,
        cy: 112,
        r: 14,
        related: [
          {
            id: "metro-ben-thanh",
            label: "Điều chỉnh lộ trình xe buýt kết nối tuyến Metro số 1",
            similarity: "0.824",
          },
        ],
        examples: [
          {
            source: "VnExpress",
            kind: "Báo chí",
            byline: "VnExpress",
            time: "Xuất bản 5 giờ trước",
            excerpt:
              "Phương án vé tích hợp theo ngày và theo tháng giúp giảm chi phí chuyển tuyến cho người đi làm.",
          },
        ],
      },
      {
        id: "bai-gui-xe",
        title: "Bố trí bãi gửi xe cá nhân dọc nhà ga trên cao",
        potential: 57,
        phase: "Đang tăng",
        accounts: 9,
        publishers: 2,
        links: 1,
        cx: 344,
        cy: 236,
        r: 12,
        related: [
          {
            id: "metro-ben-thanh",
            label: "Điều chỉnh lộ trình xe buýt kết nối tuyến Metro số 1",
            similarity: "0.781",
          },
        ],
        examples: [
          {
            source: "Otofun",
            kind: "Cộng đồng",
            byline: "of_driver_92",
            time: "Hoạt động 6 giờ trước",
            excerpt:
              "Nếu bãi gửi xe máy ở các ga vành đai đủ rộng thì người ở xa mới bỏ xe đi tàu vào nội đô được.",
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
        title: "Điều chỉnh lộ trình xe buýt kết nối tuyến Metro số 1",
        potential: 82,
        phase: "Đang tăng",
        accounts: 34,
        publishers: 5,
        links: 3,
        cx: 248,
        cy: 146,
        r: 19,
        related: [
          {
            id: "ve-lien-thong",
            label: "Đề xuất giá vé liên thông xe buýt – đường sắt đô thị",
            similarity: "0.831",
          },
          {
            id: "bai-gui-xe",
            label: "Bố trí bãi gửi xe cá nhân dọc nhà ga trên cao",
            similarity: "0.795",
          },
        ],
        examples: [
          {
            source: "Thanh Niên",
            kind: "Báo chí",
            byline: "Thanh Niên",
            time: "Xuất bản 1 ngày trước",
            excerpt:
              "Ghi nhận lượng hành khách chuyển tiếp tại ga Bến Thành và Suối Tiên tăng đều trong khung giờ cao điểm.",
          },
          {
            source: "VOZ",
            kind: "Cộng đồng",
            byline: "voz_member_104",
            time: "Hoạt động 1 ngày trước",
            excerpt:
              "Ai đi tuyến buýt điện 155 rồi cho xin nhận xét giờ chạy thực tế buổi chiều có đúng lịch không.",
          },
        ],
      },
      {
        id: "ve-lien-thong",
        title: "Đề xuất giá vé liên thông xe buýt – đường sắt đô thị",
        potential: 68,
        phase: "Duy trì",
        accounts: 16,
        publishers: 4,
        links: 2,
        cx: 386,
        cy: 112,
        r: 15,
        related: [
          {
            id: "metro-ben-thanh",
            label: "Điều chỉnh lộ trình xe buýt kết nối tuyến Metro số 1",
            similarity: "0.831",
          },
        ],
        examples: [
          {
            source: "Dân trí",
            kind: "Báo chí",
            byline: "Dân trí",
            time: "Xuất bản 2 ngày trước",
            excerpt:
              "Đơn vị vận hành thử nghiệm thanh toán không tiền mặt liên thông giữa các phương thức công cộng.",
          },
        ],
      },
      {
        id: "bai-gui-xe",
        title: "Bố trí bãi gửi xe cá nhân dọc nhà ga trên cao",
        potential: 59,
        phase: "Duy trì",
        accounts: 14,
        publishers: 3,
        links: 1,
        cx: 344,
        cy: 236,
        r: 13,
        related: [
          {
            id: "metro-ben-thanh",
            label: "Điều chỉnh lộ trình xe buýt kết nối tuyến Metro số 1",
            similarity: "0.795",
          },
        ],
        examples: [
          {
            source: "Otofun",
            kind: "Cộng đồng",
            byline: "of_driver_92",
            time: "Hoạt động 2 ngày trước",
            excerpt:
              "Các bãi giữ xe quanh ga cần công khai sức chứa theo giờ để người đi làm chủ động sắp xếp.",
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
        title: "Điều chỉnh lộ trình xe buýt kết nối tuyến Metro số 1",
        potential: 84,
        phase: "Duy trì",
        accounts: 48,
        publishers: 6,
        links: 3,
        cx: 248,
        cy: 146,
        r: 20,
        related: [
          {
            id: "ve-lien-thong",
            label: "Đề xuất giá vé liên thông xe buýt – đường sắt đô thị",
            similarity: "0.842",
          },
          {
            id: "bai-gui-xe",
            label: "Bố trí bãi gửi xe cá nhân dọc nhà ga trên cao",
            similarity: "0.804",
          },
        ],
        examples: [
          {
            source: "VnExpress",
            kind: "Báo chí",
            byline: "VnExpress",
            time: "Xuất bản 3 ngày trước",
            excerpt:
              "Mạng lưới tuyến gom giúp mở rộng bán kính tiếp cận nhà ga cho sinh viên và nhân viên văn phòng.",
          },
          {
            source: "VOZ",
            kind: "Cộng đồng",
            byline: "voz_member_418",
            time: "Hoạt động 4 ngày trước",
            excerpt:
              "Tổng hợp các tuyến buýt đi ngang qua ga Thảo Điền và An Phú kèm thời gian giãn cách chuyến.",
          },
        ],
      },
      {
        id: "ve-lien-thong",
        title: "Đề xuất giá vé liên thông xe buýt – đường sắt đô thị",
        potential: 71,
        phase: "Duy trì",
        accounts: 21,
        publishers: 4,
        links: 2,
        cx: 386,
        cy: 112,
        r: 15,
        related: [
          {
            id: "metro-ben-thanh",
            label: "Điều chỉnh lộ trình xe buýt kết nối tuyến Metro số 1",
            similarity: "0.842",
          },
        ],
        examples: [
          {
            source: "Người Việt",
            kind: "Báo chí",
            byline: "Người Việt",
            time: "Xuất bản 5 ngày trước",
            excerpt:
              "Chuyên gia giao thông đề xuất chính sách trợ giá vé tháng để khuyến khích chuyển đổi thói quen đi lại.",
          },
        ],
      },
      {
        id: "bai-gui-xe",
        title: "Bố trí bãi gửi xe cá nhân dọc nhà ga trên cao",
        potential: 55,
        phase: "Hạ nhiệt",
        accounts: 15,
        publishers: 3,
        links: 1,
        cx: 344,
        cy: 236,
        r: 12,
        related: [
          {
            id: "metro-ben-thanh",
            label: "Điều chỉnh lộ trình xe buýt kết nối tuyến Metro số 1",
            similarity: "0.804",
          },
        ],
        examples: [
          {
            source: "Otofun",
            kind: "Cộng đồng",
            byline: "of_driver_92",
            time: "Hoạt động 6 ngày trước",
            excerpt:
              "Nhiều khu vực quanh nhà ga vẫn thiếu điểm trung chuyển an toàn cho xe máy gửi qua ngày.",
          },
        ],
      },
    ],
  },
};

const COMMUNITY_SOURCES = [
  {
    name: "VOZ",
    endpoint: "voz.vn/f/17/index.rss",
    note: "Trích đoạn bài mở đầu và thời gian hoạt động diễn đàn",
  },
  {
    name: "Otofun",
    endpoint: "otofun.net.vn/forums/77/index.rss",
    note: "Thảo luận cộng đồng công khai kèm định danh nguồn",
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
  },
  {
    step: "02",
    title: "Suy luận vector hoàn toàn cục bộ",
    summary:
      "Tính vector 384 chiều bằng Xenova/multilingual-e5-small ngay trên máy chủ nội bộ; không gửi nội dung bài viết ra API bên ngoài.",
    detail:
      "Ngoài E5 cho định danh chủ đề, hệ thống lưu trữ thêm không gian MiniLM, CLIP và CLAP phục vụ truy vấn tìm kiếm đa phương thức và khử trùng lặp gần giống.",
  },
  {
    step: "03",
    title: "Gom cụm hoàn chỉnh & nối liên kết đo được",
    summary:
      "Bản ghi mới phải đạt ngưỡng tương đồng với mọi thành viên trong cụm (complete-linkage) và vượt qua kiểm tra thực thể, phiên bản, địa danh.",
    detail:
      "Nhờ vậy, GPT-5 và GPT-4.1 đứng thành hai nốt riêng nhưng vẫn nối với nhau qua ngữ nghĩa chung, tối đa 3 liên kết mỗi chủ đề và giữ nguyên các nốt độc lập.",
  },
  {
    step: "04",
    title: "Kiểm duyệt gộp/tách & theo dõi ngưỡng cảnh báo",
    summary:
      "Người phân tích có thể gộp chủ đề bị tách nhầm hoặc tách riêng một tập bản ghi kèm ghi chú kiểm toán và lịch sử hoàn tác an toàn.",
    detail:
      "Tính năng Watchlist theo dõi chủ đề hoặc thực thể với mốc tham chiếu mới (baseline), đánh giá định kỳ và phát thông báo ngay trong ứng dụng.",
  },
];

const SCORE_WEIGHTS = [
  {
    name: "Reach (Độ phủ nguồn)",
    weight: 34,
    description: "Số tài khoản cộng đồng độc lập và đầu báo đưa tin, quy đổi theo thang logarit.",
    accent: true,
  },
  {
    name: "Velocity (Gia tốc)",
    weight: 26,
    description:
      "Tốc độ bổ sung nguồn mới độc lập trong hai cửa sổ 6 giờ liên tiếp có quan sát thực.",
    accent: false,
  },
  {
    name: "Spread (Độ lan ngữ cảnh)",
    weight: 18,
    description: "Số lượng nguồn thu thập khác nhau cùng ghi nhận chủ đề trong khung thời gian.",
    accent: false,
  },
  {
    name: "Persistence (Độ bền)",
    weight: 12,
    description: "Khoảng thời gian duy trì quan sát liên tục tại hệ thống thu thập.",
    accent: false,
  },
  {
    name: "Diversity (Độ đa dạng)",
    weight: 10,
    description: "Tỷ lệ nguồn độc lập trên tổng số bản ghi chứng cứ thu được của chủ đề.",
    accent: false,
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
        meta: "48 tài khoản · 6 đầu báo · Đang duy trì",
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
      "Mỗi bảng ghi lưu riêng thời điểm xuất bản, hoạt động diễn đàn và thời điểm thu thập theo giờ ICT (UTC+7), cho phép rà soát lịch sử không suy đoán.",
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
 * Brand Mark (matches public/favicon.svg)                            *
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

/* ------------------------------------------------------------------ *
 * Main Landing Page Component                                        *
 * ------------------------------------------------------------------ */

/**
 * Public landing page for Trendifest (`/`). Presents the product's real
 * Vietnamese-first topic graph, local embedding pipeline, emergence score
 * methodology, and legal disclosures without decorative motion or fabricated claims.
 */
export function LandingPage({ onOpenApp }: LandingPageProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [previewWindow, setPreviewWindow] = useState<WindowKey>("7d");
  const [selectedTopicId, setSelectedTopicId] = useState<string>("metro-ben-thanh");
  const [activePipelineStep, setActivePipelineStep] = useState<number>(0);
  const [activeUseCase, setActiveUseCase] = useState<string>("editorial");
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactSubmitted, setContactSubmitted] = useState(false);

  const windowSnapshot = PREVIEW_WINDOWS[previewWindow];
  const selectedTopic = useMemo(
    () =>
      windowSnapshot.topics.find((topic) => topic.id === selectedTopicId) ??
      windowSnapshot.topics[0],
    [windowSnapshot, selectedTopicId],
  );
  const currentUseCase = useMemo(
    () => USE_CASES.find((item) => item.id === activeUseCase) ?? USE_CASES[0],
    [activeUseCase],
  );

  return (
    <div className="min-h-screen bg-canvas text-fg [font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe_UI',Roboto,sans-serif] antialiased text-[15px] leading-6">
      {/* ------------------------------------------------------------ */}
      {/* 1. Quiet Top Navigation                                      */}
      {/* ------------------------------------------------------------ */}
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/90 backdrop-blur-sm">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <a
            href="#"
            className="flex items-center gap-2.5 text-[16px] font-semibold tracking-tight text-fg shrink-0"
          >
            <BrandMark />
            <span>Trendifest</span>
          </a>

          <nav
            aria-label="Điều hướng chính"
            className="hidden md:flex items-center gap-6 text-[14px] text-fg-2"
          >
            <a href="#sources" className="hover:text-fg transition-colors duration-150">
              Nguồn dữ liệu
            </a>
            <a href="#pipeline" className="hover:text-fg transition-colors duration-150">
              Quy trình
            </a>
            <a href="#scoring" className="hover:text-fg transition-colors duration-150">
              Cách tính điểm
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
              className="size-9 rounded-lg text-fg-2 hover:text-fg hover:bg-hover transition-colors duration-150"
              iconClassName="size-4"
              start="top-down"
            />
            <button
              type="button"
              onClick={() => setContactModalOpen(true)}
              className="hidden sm:inline-flex items-center h-9 px-3 text-[14px] font-medium text-fg-2 hover:text-fg transition-colors duration-150"
            >
              Liên hệ
            </button>
            <button
              type="button"
              onClick={onOpenApp}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-inverse hover:bg-inverse-hover text-inverse-fg text-[14px] font-medium transition-[background-color,transform] duration-150 active:scale-[0.98]"
            >
              <span>Mở đồ thị</span>
              <ArrowRight className="size-4" strokeWidth={1.5} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label="Mở menu điều hướng"
              aria-expanded={mobileMenuOpen}
              className="md:hidden inline-flex items-center justify-center size-9 rounded-lg border border-line bg-surface text-fg-2 hover:text-fg transition-colors duration-150"
            >
              {mobileMenuOpen ? (
                <X className="size-4" strokeWidth={1.5} />
              ) : (
                <Menu className="size-4" strokeWidth={1.5} />
              )}
            </button>
          </div>
        </div>

        {/* Mobile menu disclosure */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-line bg-surface px-4 py-4 space-y-2">
            {[
              { href: "#sources", label: "Nguồn dữ liệu" },
              { href: "#pipeline", label: "Quy trình" },
              { href: "#scoring", label: "Cách tính điểm" },
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
          </div>
        )}
      </header>

      <main>
        {/* ------------------------------------------------------------ */}
        {/* 2. Hero: Headline on calm space + real workspace rising      */}
        {/* ------------------------------------------------------------ */}
        <section className="pt-10 sm:pt-12 pb-16 sm:pb-20 px-4 sm:px-6 border-b border-line">
          <div className="max-w-[1200px] mx-auto">
            {/* Editorial left-aligned text block */}
            <div className="max-w-3xl mb-8 sm:mb-10">
              <h1 className="text-[34px] sm:text-[48px] font-medium tracking-[-0.02em] text-fg leading-[1.1] mb-4">
                Bản đồ chủ đề tiếng Việt từ thảo luận cộng đồng và báo chí
              </h1>
              <p className="text-[16px] sm:text-[18px] text-fg-2 leading-[1.55] max-w-2xl mb-6">
                Trendifest thu thập trích đoạn công khai từ VOZ, Otofun cùng sáu đầu báo tiếng Việt,
                nhúng vector cục bộ để gom nhóm sự kiện và giữ nguyên liên kết kiểm chứng về bài
                gốc.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={onOpenApp}
                  className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-lg bg-inverse hover:bg-inverse-hover text-inverse-fg text-[14px] font-medium transition-[background-color,transform] duration-150 active:scale-[0.98]"
                >
                  <span>Mở đồ thị trực tiếp</span>
                  <ArrowRight className="size-4" strokeWidth={1.5} aria-hidden="true" />
                </button>
                <a
                  href="#scoring"
                  className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-lg bg-surface hover:bg-hover text-fg border border-line text-[14px] font-medium transition-colors duration-150"
                >
                  <span>Xem cách chấm điểm</span>
                </a>
              </div>
            </div>

            {/* ---------------------------------------------------------- */}
            {/* Product Moment: Interactive Workspace Preview              */}
            {/* Outer radius 16px - padding 8px = inner radius 8px         */}
            {/* ---------------------------------------------------------- */}
            <div
              aria-label="Xem trước giao diện bàn làm việc Trendifest"
              className="rounded-2xl border border-line bg-sunken p-2 shadow-xs"
            >
              <div className="rounded-lg border border-line bg-surface overflow-hidden">
                {/* Workspace header bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-line bg-canvas">
                  <div className="flex flex-wrap items-center gap-2 text-[13px] text-fg-2">
                    <Network
                      className="size-4 text-fg-3 shrink-0"
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                    <span className="font-medium text-fg whitespace-nowrap">Trend graph</span>
                    <span className="text-fg-4 hidden sm:inline">/</span>
                    <span className="font-mono text-[12px] text-fg-3 tabular-nums whitespace-nowrap">
                      {windowSnapshot.topicCount} · {windowSnapshot.linkCount}
                    </span>
                  </div>

                  {/* Real 24h / 3d / 7d window control */}
                  <div
                    role="group"
                    aria-label="Khung thời gian quan sát"
                    className="inline-flex items-center rounded-lg border border-line bg-surface p-1 gap-1"
                  >
                    {(["24h", "3d", "7d"] as const).map((win) => (
                      <button
                        key={win}
                        type="button"
                        onClick={() => setPreviewWindow(win)}
                        aria-pressed={previewWindow === win}
                        className={cn(
                          "px-2.5 py-1 rounded text-[12px] font-mono tabular-nums transition-colors duration-150",
                          previewWindow === win
                            ? "bg-active text-fg font-medium"
                            : "text-fg-3 hover:text-fg",
                        )}
                      >
                        {win}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Workspace 3-column body */}
                <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[420px]">
                  {/* Left Sidebar inside app preview */}
                  <aside className="hidden lg:flex lg:col-span-3 flex-col justify-between border-r border-line bg-canvas p-4">
                    <div className="space-y-6">
                      <div>
                        <div className="text-[12px] font-medium text-fg-3 px-2 mb-2">
                          Chế độ xem
                        </div>
                        <ul className="space-y-1 text-[13px]">
                          <li className="flex items-center gap-2.5 px-2.5 h-8 rounded-lg bg-active text-fg font-medium">
                            <Network className="size-4 text-fg-2" strokeWidth={1.5} />
                            <span>Trend graph</span>
                          </li>
                          <li className="flex items-center gap-2.5 px-2.5 h-8 rounded-lg text-fg-2">
                            <ListOrdered className="size-4 text-fg-3" strokeWidth={1.5} />
                            <span>Topic board</span>
                          </li>
                          <li className="flex items-center gap-2.5 px-2.5 h-8 rounded-lg text-fg-2">
                            <Bell className="size-4 text-fg-3" strokeWidth={1.5} />
                            <span>Watchlists & alerts</span>
                          </li>
                        </ul>
                      </div>

                      <div>
                        <div className="text-[12px] font-medium text-fg-3 px-2 mb-2">
                          Nguồn đang lọc
                        </div>
                        <ul className="space-y-1 text-[13px] text-fg-2">
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
                                "flex items-center justify-between px-2.5 h-8 rounded-lg",
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

                    <div className="pt-3 border-t border-line text-[12px] text-fg-3 px-2">
                      Suy luận cục bộ · {windowSnapshot.windowLabel}
                    </div>
                  </aside>

                  {/* Center Graph Canvas (one bright focal moment: focused topic cluster) */}
                  <div className="lg:col-span-5 relative bg-surface flex flex-col justify-between p-4 min-h-[280px] border-b lg:border-b-0 lg:border-r border-line">
                    <div className="flex items-center justify-between gap-3 text-[12px] text-fg-3">
                      <span>Nhấp một nốt chủ đề để đối chiếu bằng chứng</span>
                      <span className="font-mono whitespace-nowrap shrink-0">E5-small</span>
                    </div>

                    <svg
                      viewBox="0 0 480 250"
                      className="w-full h-56 sm:h-64 select-none"
                      role="img"
                      aria-label="Đồ thị các cụm chủ đề và liên kết ngữ nghĩa đo được"
                    >
                      {/* Quiet isolate background nodes (isolates are legitimate) */}
                      <circle cx="64" cy="48" r="5" className="fill-fg-4 opacity-40" />
                      <circle cx="104" cy="204" r="6" className="fill-fg-4 opacity-45" />
                      <circle cx="426" cy="188" r="5" className="fill-fg-4 opacity-40" />
                      <circle cx="132" cy="76" r="4" className="fill-fg-4 opacity-35" />
                      <circle cx="436" cy="48" r="4" className="fill-fg-4 opacity-35" />

                      {/* Secondary neutral cluster */}
                      <line
                        x1="82"
                        y1="132"
                        x2="136"
                        y2="164"
                        className="stroke-line-strong"
                        strokeWidth="1"
                      />
                      <circle cx="82" cy="132" r="7" className="fill-fg-3 opacity-60" />
                      <circle cx="136" cy="164" r="8" className="fill-fg-3 opacity-65" />

                      {/* Measured semantic links between the 3 inspectable topic nodes */}
                      <line
                        x1={248}
                        y1={114}
                        x2={386}
                        y2={80}
                        stroke="var(--graph-node-focused)"
                        strokeOpacity="0.45"
                        strokeWidth="1.5"
                      />
                      <line
                        x1={248}
                        y1={114}
                        x2={344}
                        y2={192}
                        stroke="var(--graph-node-focused)"
                        strokeOpacity="0.45"
                        strokeWidth="1.5"
                      />
                      <line
                        x1={386}
                        y1={80}
                        x2={344}
                        y2={192}
                        className="stroke-line-strong"
                        strokeWidth="1"
                      />

                      {/* Similarity labels on measured edges */}
                      <text
                        x="316"
                        y="88"
                        textAnchor="middle"
                        className="fill-fg-3 font-mono text-[10px]"
                      >
                        0.84
                      </text>
                      <text
                        x="282"
                        y="164"
                        textAnchor="middle"
                        className="fill-fg-3 font-mono text-[10px]"
                      >
                        0.80
                      </text>

                      {/* Clickable topic nodes */}
                      {windowSnapshot.topics.map((topic, index) => {
                        const isSelected = topic.id === selectedTopic.id;
                        const shortLabel =
                          index === 0
                            ? "Buýt kết nối Metro số 1"
                            : index === 1
                              ? "Giá vé liên thông"
                              : "Bãi gửi xe nhà ga";
                        const cy = topic.cy - 32;
                        return (
                          <g
                            key={topic.id}
                            onClick={() => setSelectedTopicId(topic.id)}
                            className="cursor-pointer"
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
                              <circle
                                cx={topic.cx}
                                cy={cy}
                                r={topic.r + 6}
                                fill="none"
                                stroke="var(--graph-node-focused)"
                                strokeOpacity="0.35"
                                strokeWidth="1.5"
                              />
                            )}
                            <circle
                              cx={topic.cx}
                              cy={cy}
                              r={topic.r}
                              fill={
                                isSelected
                                  ? "var(--graph-node-focused)"
                                  : index === 1
                                    ? "color-mix(in srgb, var(--graph-node) 50%, var(--graph-node-focused) 50%)"
                                    : "var(--graph-node)"
                              }
                              stroke="var(--surface)"
                              strokeWidth="2"
                            />
                            <text
                              x={topic.cx}
                              y={cy + topic.r + 16}
                              textAnchor="middle"
                              className={cn(
                                "text-[11px] font-medium",
                                isSelected ? "fill-fg" : "fill-fg-2",
                              )}
                            >
                              {shortLabel}
                            </text>
                          </g>
                        );
                      })}
                    </svg>

                    {/* Graph legend matching src/styles.css */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-line text-[12px] text-fg-3">
                      <div className="flex items-center gap-4">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="size-2.5 rounded-full"
                            style={{ backgroundColor: "var(--graph-node-focused)" }}
                          />
                          <span>Nhiều liên kết</span>
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="size-2.5 rounded-full"
                            style={{ backgroundColor: "var(--graph-node)" }}
                          />
                          <span>Độ phủ thấp</span>
                        </span>
                      </div>
                      <span className="font-mono text-[12px]">Kích thước = Điểm nổi lên</span>
                    </div>
                  </div>

                  {/* Right Evidence Inspector inside preview */}
                  <div className="lg:col-span-4 bg-canvas p-4 flex flex-col justify-between gap-4">
                    <div className="space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <h2 className="text-[14px] font-medium text-fg leading-snug">
                          {selectedTopic.title}
                        </h2>
                        <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded bg-tone-green-soft text-tone-green font-mono text-[12px] font-medium tabular-nums">
                          {selectedTopic.potential}/100
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 py-3 border-y border-line">
                        <div>
                          <div className="text-[12px] text-fg-3">Tài khoản</div>
                          <div className="font-mono text-[15px] font-medium text-fg tabular-nums mt-0.5">
                            {selectedTopic.accounts}
                          </div>
                        </div>
                        <div>
                          <div className="text-[12px] text-fg-3">Đầu báo</div>
                          <div className="font-mono text-[15px] font-medium text-fg tabular-nums mt-0.5">
                            {selectedTopic.publishers}
                          </div>
                        </div>
                        <div>
                          <div className="text-[12px] text-fg-3">Giai đoạn</div>
                          <div className="text-[13px] font-medium text-fg mt-1">
                            {selectedTopic.phase}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="text-[12px] font-medium text-fg-3">
                          Bằng chứng trích dẫn
                        </div>
                        {selectedTopic.examples.map((ex, i) => (
                          <div
                            key={i}
                            className="rounded-lg border border-line bg-surface p-3 space-y-1.5"
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
                    </div>

                    <button
                      type="button"
                      onClick={onOpenApp}
                      className="w-full h-9 rounded-lg border border-line bg-surface hover:bg-hover text-fg text-[13px] font-medium inline-flex items-center justify-center gap-1.5 transition-colors duration-150"
                    >
                      <span>Mở trong không gian làm việc</span>
                      <ArrowUpRight className="size-4 text-fg-3" strokeWidth={1.5} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------ */}
        {/* 3. Real Sources & Explicit Scope Separation                  */}
        {/* ------------------------------------------------------------ */}
        <section id="sources" className="py-20 sm:py-24 px-4 sm:px-6 border-b border-line">
          <div className="max-w-[1200px] mx-auto">
            <div className="max-w-2xl mb-12">
              <h2 className="text-[28px] sm:text-[36px] font-medium tracking-[-0.02em] text-fg leading-[1.15] mb-4">
                Tám nguồn công khai tiếng Việt, phân tách rõ vai trò
              </h2>
              <p className="text-[16px] text-fg-2 leading-[1.6]">
                Hệ thống thu thập theo chu kỳ có giới hạn (tối đa 500–1.000 bản ghi mỗi nguồn) và
                không bao giờ gộp tin tức báo chí thành tài khoản cộng đồng hay lượt phản hồi.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Community discussion sources */}
              <div className="lg:col-span-5 rounded-xl border border-line bg-surface p-6 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2.5 mb-4">
                    <MessageSquare
                      className="size-4 text-fg-3"
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                    <h3 className="text-[16px] font-medium text-fg">
                      Thảo luận cộng đồng (2 diễn đàn)
                    </h3>
                  </div>
                  <p className="text-[14px] text-fg-2 leading-[1.55] mb-6">
                    Mỗi bài đăng gắn với một định danh tác giả theo nguồn. Mốc thời gian RSS được
                    ghi nhãn rõ là hoạt động diễn đàn, không suy đoán thành toàn bộ luồng bình luận.
                  </p>
                </div>

                <div className="divide-y divide-line border-t border-line">
                  {COMMUNITY_SOURCES.map((src) => (
                    <div key={src.name} className="py-4 first:pt-4 last:pb-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[15px] font-medium text-fg">{src.name}</span>
                        <span className="font-mono text-[12px] text-fg-3">{src.endpoint}</span>
                      </div>
                      <p className="text-[13px] text-fg-3 mt-1">{src.note}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Publisher news sources */}
              <div className="lg:col-span-7 rounded-xl border border-line bg-surface p-6">
                <div className="flex items-center gap-2.5 mb-4">
                  <FileText className="size-4 text-fg-3" strokeWidth={1.5} aria-hidden="true" />
                  <h3 className="text-[16px] font-medium text-fg">
                    Báo chí có nhãn nguồn (6 đầu báo, 53 luồng chuyên mục)
                  </h3>
                </div>
                <p className="text-[14px] text-fg-2 leading-[1.55] mb-6">
                  Hợp nhất bài viết trùng liên kết qua các chuyên mục và tái xác thực bằng ETag. Tin
                  bài được tính riêng ở cột đầu báo để tránh nhân bản giả tạo độ phủ cộng đồng.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {NEWS_SOURCES.map((src) => (
                    <div
                      key={src.name}
                      className="rounded-lg border border-line bg-canvas px-4 py-3"
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
        {/* 4. Comparison Table                                          */}
        {/* ------------------------------------------------------------ */}
        <section className="py-20 sm:py-24 px-4 sm:px-6 border-b border-line bg-sunken">
          <div className="max-w-[1200px] mx-auto">
            <div className="max-w-2xl mb-12">
              <h2 className="text-[28px] sm:text-[36px] font-medium tracking-[-0.02em] text-fg leading-[1.15] mb-4">
                Từ đếm từ khóa bề nổi sang gom cụm có kiểm chứng
              </h2>
              <p className="text-[16px] text-fg-2 leading-[1.6]">
                Thay vì gom mọi nguồn vào một bảng xếp hạng chung chung, Trendifest giữ nguyên ngữ
                cảnh phát sinh và cấu trúc bằng chứng của từng chủ đề.
              </p>
            </div>

            <div className="rounded-xl border border-line bg-surface overflow-hidden">
              <div className="hidden md:grid md:grid-cols-12 gap-6 px-6 py-3.5 border-b border-line bg-canvas text-[13px] font-medium text-fg-3">
                <div className="col-span-3">Tiêu chí</div>
                <div className="col-span-4">Công cụ từ khóa truyền thống</div>
                <div className="col-span-5 text-fg">Cách làm của Trendifest</div>
              </div>
              <div className="divide-y divide-line">
                {COMPARISON_ROWS.map((row) => (
                  <div
                    key={row.criteria}
                    className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6 px-6 py-5 text-[14px] leading-[1.55]"
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
        {/* 5. Local Processing Pipeline (Interactive 4-step list)       */}
        {/* ------------------------------------------------------------ */}
        <section id="pipeline" className="py-20 sm:py-24 px-4 sm:px-6 border-b border-line">
          <div className="max-w-[1200px] mx-auto">
            <div className="max-w-2xl mb-12">
              <h2 className="text-[28px] sm:text-[36px] font-medium tracking-[-0.02em] text-fg leading-[1.15] mb-4">
                Bốn bước xử lý từ bản ghi thô đến đồ thị chủ đề
              </h2>
              <p className="text-[16px] text-fg-2 leading-[1.6]">
                Toàn bộ khâu tính toán vector và phân cụm chạy tách biệt trong worker nền với
                Postgres/pgvector, giữ cho luồng đọc giao diện luôn ổn định.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Step selector list */}
              <div className="lg:col-span-5 space-y-2">
                {PIPELINE_STEPS.map((item, idx) => {
                  const isActive = activePipelineStep === idx;
                  return (
                    <button
                      key={item.step}
                      type="button"
                      onClick={() => setActivePipelineStep(idx)}
                      aria-pressed={isActive}
                      className={cn(
                        "w-full text-left rounded-xl border p-4 transition-colors duration-150",
                        isActive
                          ? "border-line-strong bg-surface"
                          : "border-line bg-canvas hover:bg-surface",
                      )}
                    >
                      <div className="flex items-baseline gap-3">
                        <span
                          className="font-mono text-[13px] tabular-nums font-medium"
                          style={{
                            color: isActive ? "var(--graph-node-focused)" : "var(--fg-3)",
                          }}
                        >
                          {item.step}
                        </span>
                        <span className="text-[15px] font-medium text-fg">{item.title}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Active step detail card */}
              <div className="lg:col-span-7 rounded-xl border border-line bg-surface p-6 sm:p-8">
                <div className="flex items-center justify-between gap-4 pb-4 mb-5 border-b border-line">
                  <div className="flex items-center gap-2.5">
                    <Cpu className="size-4 text-fg-3" strokeWidth={1.5} aria-hidden="true" />
                    <span className="font-mono text-[13px] text-fg-3 tabular-nums">
                      Bước {PIPELINE_STEPS[activePipelineStep].step} / 04
                    </span>
                  </div>
                  <span className="text-[12px] font-mono text-fg-3">Local worker</span>
                </div>
                <h3 className="text-[20px] font-medium text-fg mb-3">
                  {PIPELINE_STEPS[activePipelineStep].title}
                </h3>
                <p className="text-[15px] text-fg-2 leading-[1.6] mb-4">
                  {PIPELINE_STEPS[activePipelineStep].summary}
                </p>
                <p className="text-[14px] text-fg-3 leading-[1.6]">
                  {PIPELINE_STEPS[activePipelineStep].detail}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------ */}
        {/* 6. Emergence Score & Visual Grammar (Asymmetric Split)       */}
        {/* ------------------------------------------------------------ */}
        <section
          id="scoring"
          className="py-20 sm:py-24 px-4 sm:px-6 border-b border-line bg-sunken"
        >
          <div className="max-w-[1200px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left: Weight Breakdown Chart */}
            <div className="lg:col-span-7 rounded-xl border border-line bg-surface p-6 sm:p-8">
              <div className="mb-6">
                <h2 className="text-[24px] sm:text-[28px] font-medium tracking-[-0.02em] text-fg leading-[1.2] mb-2">
                  Cấu trúc Điểm nổi lên (Emergence Score)
                </h2>
                <p className="text-[14px] text-fg-2 leading-[1.55]">
                  Điểm tổng hợp từ 0 đến 100 phản ánh bằng chứng đã thu thập trong cửa sổ quan sát,
                  nhân với hệ số độ tin cậy{" "}
                  <span className="font-mono text-[13px] text-fg">
                    0.3 + 0.7 × min(1, (tài khoản + đầu báo) / 5)
                  </span>
                  .
                </p>
              </div>

              <div className="space-y-5">
                {SCORE_WEIGHTS.map((factor) => (
                  <div key={factor.name}>
                    <div className="flex items-baseline justify-between gap-4 mb-1.5">
                      <span className="text-[14px] font-medium text-fg">{factor.name}</span>
                      <span className="font-mono text-[13px] font-medium text-fg tabular-nums">
                        {factor.weight}%
                      </span>
                    </div>
                    <div className="h-2 w-full rounded bg-canvas border border-line overflow-hidden mb-1.5">
                      <div
                        className="h-full rounded-sm"
                        style={{
                          width: `${factor.weight}%`,
                          backgroundColor: factor.accent
                            ? "var(--graph-node-focused)"
                            : "var(--fg-3)",
                        }}
                      />
                    </div>
                    <p className="text-[13px] text-fg-3">{factor.description}</p>
                  </div>
                ))}
              </div>

              <div className="mt-6 pt-5 border-t border-line text-[13px] text-fg-3 leading-[1.55]">
                Thành phần Velocity giữ ở mức trung tính cho đến khi chủ đề tích lũy đủ mẫu quan sát
                theo giờ phủ hai cửa sổ 6 giờ liên tiếp không có khoảng trống quá 75 phút.
              </div>
            </div>

            {/* Right: Graph Reading Guide */}
            <div className="lg:col-span-5 space-y-4">
              <div className="rounded-xl border border-line bg-surface p-6">
                <div className="flex items-center gap-2.5 mb-2">
                  <Layers className="size-4 text-fg-3" strokeWidth={1.5} aria-hidden="true" />
                  <h3 className="text-[15px] font-medium text-fg">Kích thước nốt</h3>
                </div>
                <p className="text-[14px] text-fg-2 leading-[1.55]">
                  Tỷ lệ thuận với điểm nổi lên. Nhiều bài viết độc lập cùng nói về một sự kiện sẽ
                  củng cố kích thước của một nốt duy nhất thay vì tạo ra các chấm rời rạc.
                </p>
              </div>

              <div className="rounded-xl border border-line bg-surface p-6">
                <div className="flex items-center gap-2.5 mb-2">
                  <Network className="size-4 text-fg-3" strokeWidth={1.5} aria-hidden="true" />
                  <h3 className="text-[15px] font-medium text-fg">Màu sắc & cạnh nối</h3>
                </div>
                <p className="text-[14px] text-fg-2 leading-[1.55]">
                  Màu chạy từ trung tính sang tím khi số liên kết chủ đề tăng (tối đa 3 liên kết
                  mạnh nhất). Cạnh nối chỉ dùng làm ngữ cảnh, không cộng thêm điểm.
                </p>
              </div>

              <div className="rounded-xl border border-line bg-surface p-6">
                <div className="flex items-center gap-2.5 mb-2">
                  <GitMerge className="size-4 text-fg-3" strokeWidth={1.5} aria-hidden="true" />
                  <h3 className="text-[15px] font-medium text-fg">Kiểm duyệt gộp & tách</h3>
                </div>
                <p className="text-[14px] text-fg-2 leading-[1.55]">
                  Khóa tương thích thực thể và năm sự kiện khi gộp; cho phép tách bản ghi chọn lọc
                  và hoàn tác nếu chưa có thay đổi phụ thuộc mới hơn.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------ */}
        {/* 7. Use Cases (Tabbed Workflows + Matching Artifact)          */}
        {/* ------------------------------------------------------------ */}
        <section id="use-cases" className="py-20 sm:py-24 px-4 sm:px-6 border-b border-line">
          <div className="max-w-[1200px] mx-auto">
            <div className="max-w-2xl mb-8">
              <h2 className="text-[28px] sm:text-[36px] font-medium tracking-[-0.02em] text-fg leading-[1.15] mb-4">
                Ứng dụng trong công việc hằng ngày
              </h2>
              <p className="text-[16px] text-fg-2 leading-[1.6]">
                Chọn góc nhìn phù hợp để xem cách bảng chủ đề, nhật ký kiểm duyệt và quy tắc theo
                dõi vận hành cùng nhau.
              </p>
            </div>

            {/* Tab list */}
            <div role="tablist" aria-label="Nhóm người dùng" className="flex flex-wrap gap-2 mb-8">
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
                      "h-9 px-4 rounded-lg text-[14px] font-medium border transition-colors duration-150",
                      isActive
                        ? "bg-inverse text-inverse-fg border-inverse"
                        : "bg-surface text-fg-2 border-line hover:text-fg hover:bg-hover",
                    )}
                  >
                    {uc.tab}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start rounded-xl border border-line bg-surface p-6 sm:p-8">
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

              <div className="lg:col-span-5 rounded-lg border border-line bg-canvas p-5">
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-line">
                  <span className="text-[13px] font-medium text-fg">
                    {currentUseCase.artifactTitle}
                  </span>
                  <span className="font-mono text-[12px] text-fg-3">Mẫu giao diện</span>
                </div>
                <div className="space-y-2.5">
                  {currentUseCase.artifactRows.map((row) => (
                    <div key={row.label} className="rounded-lg border border-line bg-surface p-3.5">
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
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------ */}
        {/* 8. Compliance & Privacy Architecture                         */}
        {/* ------------------------------------------------------------ */}
        <section
          id="compliance"
          className="py-20 sm:py-24 px-4 sm:px-6 border-b border-line bg-sunken"
        >
          <div className="max-w-[1200px] mx-auto">
            <div className="max-w-2xl mb-12">
              <h2 className="text-[28px] sm:text-[36px] font-medium tracking-[-0.02em] text-fg leading-[1.15] mb-4">
                Thu thập có ranh giới và suy luận tại chỗ
              </h2>
              <p className="text-[16px] text-fg-2 leading-[1.6]">
                Thiết kế theo nguyên tắc ưu tiên cổng truy cập hợp lệ, không giữ HTML thô và tách
                bạch rõ giới hạn mẫu ngay trong giao diện phân tích.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="rounded-xl border border-line bg-surface p-6">
                <div className="flex items-center gap-2.5 mb-3">
                  <ShieldCheck className="size-4 text-fg-3" strokeWidth={1.5} aria-hidden="true" />
                  <h3 className="text-[16px] font-medium text-fg">Đối chiếu Luật 91/2025/QH15</h3>
                </div>
                <p className="text-[14px] text-fg-2 leading-[1.6] mb-4">
                  Thiết kế hướng tới tuân thủ Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15 và Nghị định
                  356/2025/NĐ-CP.
                </p>
                <ul className="space-y-2 text-[13px] text-fg-3">
                  <li>Không suy đoán độ tuổi hay nhân khẩu học</li>
                  <li>Không gộp tài khoản chéo nền tảng thành một người</li>
                  <li>Chỉ xử lý văn bản công khai qua danh mục cấu hình</li>
                </ul>
              </div>

              <div className="rounded-xl border border-line bg-surface p-6">
                <div className="flex items-center gap-2.5 mb-3">
                  <Database className="size-4 text-fg-3" strokeWidth={1.5} aria-hidden="true" />
                  <h3 className="text-[16px] font-medium text-fg">Cổng công khai có giới hạn</h3>
                </div>
                <p className="text-[14px] text-fg-2 leading-[1.6] mb-4">
                  Mỗi phản hồi HTTP giới hạn tối đa 1 MB và thời hạn 15 giây, không thu thập lén qua
                  thách thức bảo mật.
                </p>
                <ul className="space-y-2 text-[13px] text-fg-3">
                  <li>Không lưu giữ mã nguồn HTML hay script của trang báo</li>
                  <li>Chỉ lấy ảnh đính kèm HTTPS từ đúng tên miền nguồn</li>
                  <li>Hiển thị lỗi từng chuyên mục thay vì ẩn thành nguồn rỗng</li>
                </ul>
              </div>

              <div className="rounded-xl border border-line bg-surface p-6">
                <div className="flex items-center gap-2.5 mb-3">
                  <Lock className="size-4 text-fg-3" strokeWidth={1.5} aria-hidden="true" />
                  <h3 className="text-[16px] font-medium text-fg">Local AI & hết hạn 30 ngày</h3>
                </div>
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
        {/* 9. FAQ Accordion                                             */}
        {/* ------------------------------------------------------------ */}
        <section id="faq" className="py-20 sm:py-24 px-4 sm:px-6 border-b border-line">
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
                      <span className="text-[16px] font-medium leading-[1.45]">{faq.question}</span>
                      <ChevronDown
                        className={cn(
                          "size-4 text-fg-3 shrink-0 transition-transform duration-150",
                          isOpen && "rotate-180",
                        )}
                        strokeWidth={1.5}
                      />
                    </button>
                    {isOpen && (
                      <p className="mt-3 text-[14px] text-fg-2 leading-[1.6] pr-8">{faq.answer}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------ */}
        {/* 10. Quiet Closing Callout                                    */}
        {/* ------------------------------------------------------------ */}
        <section className="py-20 px-4 sm:px-6">
          <div className="max-w-[1200px] mx-auto rounded-2xl border border-line bg-surface p-8 sm:p-12 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="max-w-xl">
              <h2 className="text-[24px] sm:text-[32px] font-medium tracking-[-0.02em] text-fg leading-[1.15] mb-3">
                Bắt đầu khảo sát bản đồ chủ đề ngay trong trình duyệt
              </h2>
              <p className="text-[15px] text-fg-2 leading-[1.55]">
                Không cần đăng nhập hay cài đặt tiện ích bổ sung. Toàn bộ đồ thị, bảng xếp hạng và
                quy tắc theo dõi hoạt động trực tiếp tại trang ứng dụng.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={onOpenApp}
                className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-lg bg-inverse hover:bg-inverse-hover text-inverse-fg text-[14px] font-medium transition-[background-color,transform] duration-150 active:scale-[0.98]"
              >
                <span>Mở đồ thị trực tiếp</span>
                <ArrowRight className="size-4" strokeWidth={1.5} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setContactModalOpen(true)}
                className="inline-flex items-center justify-center h-11 px-5 rounded-lg border border-line bg-canvas hover:bg-hover text-fg text-[14px] font-medium transition-colors duration-150"
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
                  Cách tính điểm
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
      {/* 12. Contact / Walkthrough Modal                              */}
      {/* ------------------------------------------------------------ */}
      {contactModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="contact-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-scrim"
        >
          <div className="w-full max-w-md rounded-xl border border-line bg-surface p-6 shadow-float relative">
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

            {!contactSubmitted ? (
              <>
                <h3 id="contact-dialog-title" className="text-[18px] font-medium text-fg mb-2">
                  Liên hệ trao đổi về Trendifest
                </h3>
                <p className="text-[14px] text-fg-2 leading-[1.55] mb-5">
                  Để lại thông tin nếu bạn muốn trao đổi về triển khai cục bộ hoặc danh mục nguồn
                  tiếng Việt.
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
                      className="w-full h-10 px-3 rounded-lg border border-line bg-canvas text-[14px] text-fg placeholder:text-fg-3"
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
                      className="w-full h-10 px-3 rounded-lg border border-line bg-canvas text-[14px] text-fg placeholder:text-fg-3"
                    />
                  </div>
                  <div>
                    <label className="block text-[13px] font-medium text-fg-2 mb-1.5">
                      Nội dung quan tâm
                    </label>
                    <select className="w-full h-10 px-3 rounded-lg border border-line bg-canvas text-[14px] text-fg">
                      <option>Triển khai máy chủ thu thập & nhúng cục bộ</option>
                      <option>Nghiên cứu chủ đề báo chí và diễn đàn tiếng Việt</option>
                      <option>Góp ý về bộ nguồn công khai hoặc thuật toán gom cụm</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    className="w-full h-10 rounded-lg bg-inverse hover:bg-inverse-hover text-inverse-fg text-[14px] font-medium transition-colors duration-150"
                  >
                    Gửi thông tin
                  </button>
                </form>
              </>
            ) : (
              <div className="py-4">
                <h3 id="contact-dialog-title" className="text-[18px] font-medium text-fg mb-2">
                  Đã ghi nhận thông tin
                </h3>
                <p className="text-[14px] text-fg-2 leading-[1.55] mb-5">
                  Cảm ơn bạn đã liên hệ. Đội ngũ phụ trách sẽ phản hồi qua email bạn đã cung cấp.
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
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
