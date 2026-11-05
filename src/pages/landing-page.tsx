import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BrainCircuit,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Compass,
  Cpu,
  ExternalLink,
  Eye,
  FileCheck2,
  Film,
  Flame,
  Globe2,
  Headphones,
  HelpCircle,
  History,
  Layers,
  Lock,
  MessageSquare,
  Network,
  PlayCircle,
  Radio,
  Shield,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  Video,
  X,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@trendifest/opendesk";
import { ThemeToggle } from "@/components/motion/theme-toggle";

export interface LandingPageProps {
  onOpenApp: () => void;
}

/* ------------------------------------------------------------------ *
 * Static data for specs & storytelling                               *
 * ------------------------------------------------------------------ */

interface DataStreamNode {
  name: string;
  category: string;
  icon: typeof Sparkles;
  color: string;
  top: string;
  left?: string;
  right?: string;
  anim: string;
  delay: string;
}

const DATA_STREAM_LEFT: DataStreamNode[] = [
  {
    name: "Bluesky Jetstream",
    category: "AT Protocol v2 Tail",
    icon: Radio,
    color: "#38bdf8",
    top: "10%",
    left: "2%",
    anim: "animate-float-1",
    delay: "0s",
  },
  {
    name: "Threads Graph API",
    category: "Meta Multi-post Stream",
    icon: MessageSquare,
    color: "#f43f5e",
    top: "28%",
    left: "5%",
    anim: "animate-float-2",
    delay: "1.2s",
  },
  {
    name: "TikTok Research API",
    category: "Viral Audio Signals",
    icon: Video,
    color: "#22d3ee",
    top: "48%",
    left: "3%",
    anim: "animate-float-1",
    delay: "2.4s",
  },
  {
    name: "CapCut Templates",
    category: "Video Remix Clusters",
    icon: Film,
    color: "#e879f9",
    top: "68%",
    left: "6%",
    anim: "animate-float-2",
    delay: "0.8s",
  },
];

const DATA_STREAM_RIGHT: DataStreamNode[] = [
  {
    name: "Hawkes Point Process",
    category: "Diffusion Forecasting",
    icon: TrendingUp,
    color: "#34d399",
    top: "10%",
    right: "2%",
    anim: "animate-float-2",
    delay: "0.5s",
  },
  {
    name: "CLIP ViT-B/32",
    category: "Multimodal Embeddings",
    icon: Eye,
    color: "#fbbf24",
    top: "28%",
    right: "5%",
    anim: "animate-float-1",
    delay: "1.8s",
  },
  {
    name: "Temporal GNN",
    category: "Dynamic Link Prediction",
    icon: Network,
    color: "#a78bfa",
    top: "48%",
    right: "3%",
    anim: "animate-float-2",
    delay: "0.3s",
  },
  {
    name: "Demucs Audio Stems",
    category: "PeakNetFP Fingerprint",
    icon: Headphones,
    color: "#818cf8",
    top: "68%",
    right: "6%",
    anim: "animate-float-1",
    delay: "2.1s",
  },
];

interface MarketStat {
  value: string;
  label: string;
  description: string;
}

const MARKET_STATS: MarketStat[] = [
  {
    value: "79+ Triệu",
    label: "Tài khoản MXH tại Việt Nam",
    description:
      "Chiếm 77,6% dân số (DataReportal 2026), tạo ra hàng chục triệu tương tác mỗi ngày.",
  },
  {
    value: "6 – 24 Giờ",
    label: "Cảnh báo sớm trước đỉnh sóng",
    description:
      "Nhận diện đốm lửa bộc phát ngay từ cộng đồng ngách trước khi xuất hiện trên Google Trends.",
  },
  {
    value: "100%",
    label: "Phân tích Đa phương thức",
    description: "Bóc tách đồng thời văn bản, meme hình ảnh, dấu vân tay âm thanh và video CapCut.",
  },
  {
    value: "0 Cloud Leak",
    label: "An toàn dữ liệu tuyệt đối",
    description:
      "Toàn bộ vector nhúng AI chạy cục bộ (Local Inference), không chia sẻ ra bên thứ ba.",
  },
];

const AUDIENCE_SEGMENTS = [
  {
    id: "shitpost",
    name: "Shitposting & Meme",
    icon: Sparkles,
    desc: "Cộng đồng meme, joke formats & parody",
    color: "#a78bfa",
  },
  {
    id: "music",
    name: "Music Discovery",
    icon: Headphones,
    desc: "Âm thanh remix, soundtrack & sample mới",
    color: "#60a5fa",
  },
  {
    id: "gaming",
    name: "VTuber & Gaming",
    icon: Flame,
    desc: "Fandom gaming, livestream & reaction",
    color: "#f472b6",
  },
  {
    id: "overheard",
    name: "Overheard Quotes",
    icon: MessageSquare,
    desc: "Ảnh chụp màn hình, câu nói viral & đối thoại",
    color: "#34d399",
  },
  {
    id: "art",
    name: "Artists & Fandom",
    icon: Eye,
    desc: "Tranh vẽ OC, xu hướng thẩm mỹ thị giác",
    color: "#fbbf24",
  },
  {
    id: "film",
    name: "Film & Pop Culture",
    icon: Film,
    desc: "Thảo luận điện ảnh, show thực tế & thần tượng",
    color: "#a3e635",
  },
];

const COMPARISON_ROWS = [
  {
    criteria: "Cách tiếp cận",
    traditional:
      "Đợi người dùng gõ từ khóa trên Google hoặc đếm lượt xem (Views/Likes) bề nổi sau khi bài đã viral.",
    trendifest:
      "Quét trực tiếp tín hiệu bất thường từ bài viết, âm thanh và mẫu dựng video rải rác ngay từ lúc mới đăng.",
  },
  {
    criteria: "Thời điểm phát hiện",
    traditional:
      "Sau 3 – 5 ngày: Khi trend đã phủ sóng triệu view, thương hiệu nhảy vào thì chi phí quảng cáo đã tăng vọt.",
    trendifest:
      "Trước 6 – 24 giờ: Ngay từ khi trend chỉ là mẩu chuyện cười hoặc đoạn nhạc ngách trong một tiểu nhóm.",
  },
  {
    criteria: "Bản chất trào lưu",
    traditional:
      "Chỉ theo dõi được chữ (Text) và hashtag đã có tên gọi cụ thể; hoàn toàn mù tịt trước meme hình và âm thanh.",
    trendifest:
      "Nhận diện cả Meme ảnh biến thể, Điệu nhảy, Dấu vân tay âm thanh (Audio Fingerprint) và Cấu trúc câu đùa.",
  },
  {
    criteria: "Độ tin cậy & Chống gian lận",
    traditional:
      "Dễ bị thao túng bởi bot ảo cày view, spam hàng nghìn bài viết từ một vài tài khoản mạng lưới.",
    trendifest:
      "Đo lường bằng số lượng Tác Giả Độc Lập Thực Tế (Independent Authors) và hiện tượng di tản xuyên cộng đồng.",
  },
];

const TIMELINE_STEPS = [
  {
    time: "T0",
    badge: "Phát hiện tín hiệu yếu",
    title: "Thu thập tín hiệu mới chớm",
    description:
      "Hệ thống ghi nhận các bài đăng chứa từ lóng mới hoặc đoạn nhạc remix vừa xuất hiện rải rác trên Threads và Bluesky với lượng like ban đầu chỉ dưới 50.",
    signal: "5 bài đăng • 4 tác giả • Tần suất tăng 320% trong 20 phút",
  },
  {
    time: "T + 1h",
    badge: "Phân tích đa phương thức & Gom cụm",
    title: "Trích xuất đặc trưng & Gom cụm Sự kiện",
    description:
      "AI giải mã chữ trong ảnh (OCR), tách âm thanh (Demucs) và đối chiếu dấu vân tay âm thanh. Tất cả các biến thể được gom vào một cụm sự kiện (Complete-linkage Event Graph).",
    signal: "18 biến thể video CapCut • Khớp dấu vân tay nhạc mẫu • Độ gắn kết centroid 0.81",
  },
  {
    time: "T + 2h",
    badge: "Dự báo lan truyền (Diffusion Forecasting)",
    title: "Mô hình Hawkes Process kích hoạt",
    description:
      "Thuật toán phát hiện sự kiện 'vượt biên' từ cộng đồng Gaming sang cộng đồng Shitposting & Hài hước. Mô hình Hawkes tính toán gia tốc lan truyền tự kích hoạt.",
    signal: "Xác suất bùng nổ thành Trend trong 12h tới: 74% (Khoảng tin cậy: 68% - 81%)",
  },
  {
    time: "T + 2.5h",
    badge: "Thẻ cảnh báo & Minh chứng",
    title: "Bắn Alert Card kèm bằng chứng kiểm chứng",
    description:
      "Hệ thống phát tín hiệu cảnh báo tới giao diện Analyst Console của doanh nghiệp, đính kèm link bài gốc, mức độ bất định và đề xuất kịch bản truyền thông đón đầu.",
    signal: "Đội ngũ Marketing lên kế hoạch trước 18 giờ trước khi trào lưu chạm đỉnh!",
  },
];

const TECH_PILLARS = [
  {
    number: "01",
    icon: Zap,
    title: "Lớp Phát Hiện Tín Hiệu Yếu (Weak Signal & Burst Detection)",
    description:
      "Ứng dụng thuật toán phát hiện đột biến chuỗi thời gian của Kleinberg kết hợp Detector Ensemble. Tự động nhận diện các từ lóng mới, biến thể ngôn ngữ vừa xuất hiện dù tần suất ban đầu còn rất thấp nhưng có gia tốc đột ngột.",
    tags: ["Kleinberg Burst", "Detector Ensemble", "Slang Normalization"],
  },
  {
    number: "02",
    icon: BrainCircuit,
    title: "Lớp Ngữ Cảnh Đa Phương Thức (Multimodal Intelligence)",
    description:
      "Âm thanh: Tách dải âm Demucs, tạo vân tay âm thanh PeakNetFP & chuyển thoại WhisperX. Hình ảnh/Video: CLIP Vision trích xuất khung hình và đối sánh mẫu dựng CapCut. Văn bản: Chuẩn hóa tiếng lóng Gen Z Việt Nam và gán nhãn lập trường.",
    tags: ["CLIP ViT-B/32", "CLAP Audio", "MiniLM Multilingual", "FFmpeg Engine"],
  },
  {
    number: "03",
    icon: TrendingUp,
    title: "Lớp Dự Báo Lan Truyền (Diffusion Forecasting)",
    description:
      "Áp dụng quá trình điểm theo thời gian (Hawkes Process) kết hợp Gradient Boosting và Mạng thần kinh đồ thị thời gian (Temporal GNN). Đầu ra là phân bố xác suất cụ thể (6h, 12h, 24h) kèm khoảng tin cậy minh bạch, tuyệt đối không đoán mò.",
    tags: ["Hawkes Process", "Temporal GNN", "Velocity Curves", "Confidence Interval"],
  },
  {
    number: "04",
    icon: ShieldCheck,
    title: "Lớp Minh Chứng & Kiểm Chứng (Analyst Console & HITL)",
    description:
      "Cung cấp giao diện trực quan với đầy đủ bằng chứng kiểm chứng: đồ thị di chuyển giữa các cộng đồng, nguồn gốc truyền thông và đường dẫn bài viết gốc. Tích hợp cơ chế Con người kiểm duyệt (Human-in-the-loop) ngăn chặn báo động giả.",
    tags: ["Evidence Grounding", "Human-in-the-loop", "Luật 91/2025/QH15", "Tôn trọng Deletion"],
  },
];

const USE_CASES = [
  {
    id: "brands",
    tab: "Doanh nghiệp & Thương hiệu",
    headline: "Đón đầu làn sóng thảo luận trước khi giá thầu quảng cáo leo thang",
    description:
      "Rút ngắn thời gian chuẩn bị chiến dịch truyền thông từ 3 ngày xuống còn vài giờ. Nắm bắt xu hướng khi chi phí sáng tạo nội dung và hợp tác với KOCs còn ở mức tối ưu nhất.",
    points: [
      "Bắt trend đúng lúc: Tung nội dung khi cộng đồng bắt đầu tò mò, không phải khi mọi người đã bội thực.",
      "Cảnh báo khủng hoảng sớm: Phát hiện các đợt biến động thảo luận tiêu cực hoặc tranh cãi ngầm trước khi bùng nổ thành khủng hoảng truyền thông.",
      "Tối ưu ngân sách Ads: Giảm chi phí CPM/CPC nhờ tận dụng lượng thảo luận tự nhiên (organic momentum).",
    ],
    metric: "Tiết kiệm 45% ngân sách marketing đón đầu",
    previewTitle: "Bảng phân tích thương hiệu (Brand Radar)",
    previewBadge: "Cảnh báo cơ hội thương hiệu",
    previewEvent: "Âm thanh 'Nhạc chế Gen Z đi làm' • 78% cơ hội tăng trưởng",
    previewCommunity: "Gaming → Văn phòng trẻ",
  },
  {
    id: "agencies",
    tab: "Marketing & Creative Agencies",
    headline: "Thuyết phục khách hàng bằng số liệu dự báo xác suất khoa học",
    description:
      "Tạm biệt các bản pitch ý tưởng dựa trên cảm tính. Giờ đây Agency có thể trình bày với Brand bằng đồ thị lan truyền thực tế và xác suất bùng nổ được mô hình hóa bằng thuật toán.",
    points: [
      "Pitching ý tưởng bất bại: Trình chiếu đồ thị trinh sát chứng minh trào lưu đang dịch chuyển sang nhóm khách hàng mục tiêu.",
      "Báo cáo Insight đa chiều: Cung cấp insight văn hóa mạng kết hợp âm thanh, hình ảnh chế và từ lóng thực tế.",
      "Sản xuất nội dung siêu tốc: Nắm bắt chính xác mẫu video CapCut hoặc âm thanh đang thịnh hành để dựng clip ngay trong ngày.",
    ],
    metric: "Tăng 3.2x tỷ lệ chốt deal pitching chiến dịch",
    previewTitle: "Hồ sơ đề xuất ý tưởng (Pitch Deck Evidence)",
    previewBadge: "Bằng chứng nghiên cứu số",
    previewEvent: "Cụm trào lưu #FlexGiaDinh • Đang lan sang nhóm 18-24 tuổi",
    previewCommunity: "Shitposting → Đời sống học đường",
  },
  {
    id: "creators",
    tab: "Nhà sáng tạo (Creators & KOCs)",
    headline: "Bắt đúng soundtrack và mẫu dựng CapCut để đẩy video lên xu hướng",
    description:
      "Thuật toán của TikTok và Reels luôn ưu tiên những video sử dụng âm thanh hoặc mẫu dựng đang có gia tốc sử dụng tăng nhanh. Trendifest cho bạn biết âm thanh nào sắp bùng nổ trước 12 giờ.",
    points: [
      "Đón đầu thuật toán đề xuất: Dùng soundtrack từ khi nó chỉ có vài trăm video sử dụng, hưởng trọn đợt sóng viral đầu tiên.",
      "Tránh bão hòa: Biết rõ thời điểm một trào lưu bắt đầu bước vào giai đoạn thoái trào để dừng làm clip đúng lúc.",
      "Không bao giờ cạn ý tưởng: Khám phá hàng chục biến thể đùa giỡn, meme template đang manh nha mỗi sáng.",
    ],
    metric: "Tăng 250% tỷ lệ video cắn đề xuất For You Page",
    previewTitle: "Kênh trinh sát KOC (Creator Pulse)",
    previewBadge: "Soundtrack tiềm năng cao",
    previewEvent: "Đoạn beat remix 'SaiGon Sunset' • 88 điểm bộc phát",
    previewCommunity: "Music Discovery → Đời sống Gen Z",
  },
  {
    id: "researchers",
    tab: "Nghiên cứu Thị trường & Xã hội",
    headline: "Quan sát sự chuyển dịch văn hóa số của thế hệ trẻ một cách trung thực",
    description:
      "Công cụ lý tưởng cho các viện nghiên cứu, trường đại học và cơ quan xã hội theo dõi diễn biến tâm lý, ngôn ngữ mạng và biến động thảo luận của Gen Z trên môi trường số an toàn, bảo mật.",
    points: [
      "Bảo tồn dữ liệu nghiên cứu: Lưu giữ vết di chuyển của văn hóa mạng qua biểu đồ thời gian có thể tua lại quá khứ.",
      "Tuân thủ đạo đức dữ liệu: Tôn trọng hoàn toàn quyền riêng tư cá nhân và các quy định pháp luật hiện hành.",
      "Minh bạch học thuật: Toàn bộ trọng số mô hình, ngưỡng tương đồng và độ đo đều được công khai minh bạch.",
    ],
    metric: "100% Khả năng kiểm chứng học thuật & tái lập",
    previewTitle: "Trắc diện văn hóa số (Cultural Observability)",
    previewBadge: "Dữ liệu nghiên cứu định lượng",
    previewEvent: "Nghiên cứu biến đổi tiếng lóng Gen Z tại đô thị VN",
    previewCommunity: "Viện Nghiên cứu Xã hội số • Mạng lưới Ngôn ngữ học",
  },
];

const FAQS = [
  {
    question:
      "Trendifest khác biệt gì so với Google Trends hoặc các công cụ Social Listening truyền thống?",
    answer:
      "Google Trends chỉ ghi nhận khi người dùng chủ động gõ tìm kiếm một từ khóa cụ thể — tức là trào lưu đã quá phổ biến và đã qua giai đoạn sớm. Các công cụ Social Listening truyền thống thì chủ yếu đếm lượt xem (Views/Likes) bề nổi và phụ thuộc vào Text/Hashtag. Ngược lại, Trendifest phân tích đa phương thức (hình ảnh, meme, âm thanh, video CapCut) và phát hiện các đốm lửa bộc phát từ các cộng đồng ngách trước từ 6 đến 24 giờ dựa trên số lượng tác giả độc lập và mô hình điểm Hawkes.",
  },
  {
    question:
      "Xác suất dự báo (ví dụ: '74% trong 12h') được tính toán như thế nào? Có đáng tin cậy không?",
    answer:
      "Xác suất không phải là một con số ngẫu nhiên do AI tự bịa. Hệ thống kết hợp quá trình điểm theo thời gian (Hawkes Process) và mô hình học máy Gradient Boosting được huấn luyện trên chuỗi thời gian lan truyền. Mô hình tính toán gia tốc gia tăng số lượng tác giả độc lập mới, tỷ lệ lan truyền xuyên cộng đồng (community crossing) và khoảng thời gian tồn tại để đưa ra phân bố xác suất kèm khoảng tin cậy minh bạch.",
  },
  {
    question:
      "Trendifest có vi phạm bản quyền hay sử dụng kỹ thuật cào dữ liệu lậu (scraping) không?",
    answer:
      "Tuyệt đối không. Trendifest được thiết kế với phương châm 'Access-First', chỉ tích hợp thông qua các cổng API chính thức và luồng cấp phép (như Bluesky Jetstream v2, Meta Threads API, TikTok Research API). Hệ thống tiên phong tuân thủ Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 và Nghị định 356/2025/NĐ-CP của Việt Nam.",
  },
  {
    question: "Quyền lãng quên (Deletion Compliance) và bảo mật cục bộ được thực hiện ra sao?",
    answer:
      "Khi một tác giả xóa bài viết hoặc xóa video trên mạng xã hội gốc, hệ thống Trendifest lập tức nhận diện sự kiện tombstone/deletion và tự động xóa bỏ hoàn toàn bài đăng, vector nhúng cũng như liên kết đồ thị liên quan. Ngoài ra, 100% mô hình AI trích xuất vector (Text, CLIP, CLAP) chạy cục bộ trên máy chủ nội bộ, không bao giờ gửi dữ liệu cộng đồng sang bên thứ ba.",
  },
  {
    question:
      "Người dùng có thể kiểm chứng nguồn gốc của cảnh báo trước khi đưa ra quyết định không?",
    answer:
      "Có. Triết lý của Trendifest là Human-in-the-loop (con người kiểm chứng). Mỗi cảnh báo bộc phát đều đính kèm danh sách bài viết nguồn, tác giả, dấu vân tay âm thanh và đường link trực tiếp mở thẳng bài đăng trên mạng xã hội. Người dùng luôn có đầy đủ minh chứng thực tế trước khi phê duyệt chiến dịch truyền thông.",
  },
  {
    question: "Hiện tại Trendifest đang theo dõi những phân đoạn cộng đồng nào?",
    answer:
      "Hệ thống hiện phân tầng 9 phân đoạn khán giả đại diện cho văn hóa Gen Z: Shitposting & Meme, Music discovery, VTuber & Gaming fandom, Overheard quotes, Himbo community, New users, Artists & Fandom, Film & TV và kho dữ liệu Discover chung.",
  },
];

/* ------------------------------------------------------------------ *
 * Main Landing Page Component                                        *
 * ------------------------------------------------------------------ */

export function LandingPage({ onOpenApp }: LandingPageProps) {
  const [activeUseCase, setActiveUseCase] = useState("brands");
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [demoModalOpen, setDemoModalOpen] = useState(false);
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [demoSubmitted, setDemoSubmitted] = useState(false);

  // Simulated live graph window
  const [graphWindow, setGraphWindow] = useState<string>("24h");

  // Interactive timeline step (0 to 3)
  const [activeTimelineStep, setActiveTimelineStep] = useState<number>(2);

  const currentUseCase = useMemo(
    () => USE_CASES.find((u) => u.id === activeUseCase) ?? USE_CASES[0],
    [activeUseCase],
  );

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#1e1e1e] text-[#171717] dark:text-[#dadada] font-sans antialiased text-[16px] leading-relaxed selection:bg-[#7f6df2]/30 selection:text-[#ffffff] transition-colors duration-200">
      {/* ------------------------------------------------------------ */}
      {/* 1. Header / Floating Pill Navbar (Inspired by Lindy Tile 1)  */}
      {/* ------------------------------------------------------------ */}
      <header className="fixed top-0 inset-x-0 z-50 flex justify-center px-4 py-3 pointer-events-none">
        <nav
          className="pointer-events-auto flex items-center justify-between gap-3 sm:gap-6 px-5 sm:px-7 py-3 rounded-full bg-white/90 dark:bg-[#262626]/95 backdrop-blur-md border border-neutral-200 dark:border-[#363636] shadow-xl max-w-5xl w-full"
          aria-label="Thanh điều hướng chính"
        >
          {/* Brand Logo */}
          <a
            href="#"
            className="flex items-center gap-2.5 text-[17px] font-bold text-neutral-900 dark:text-white tracking-tight hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-[#a78bfa]/20 border border-[#a78bfa]/40 text-[#a78bfa] shrink-0">
              <Network className="size-4.5 animate-pulse" />
            </span>
            <span>Trendifest</span>
            <span className="hidden sm:inline-flex text-[11px] uppercase font-mono px-2.5 py-0.5 rounded bg-neutral-100 dark:bg-[#333333] text-[#7c3aed] dark:text-[#a78bfa] whitespace-nowrap border border-neutral-300 dark:border-[#444444]">
              v1.4 LIVE
            </span>
          </a>

          {/* Desktop Nav Links */}
          <div className="hidden md:flex items-center gap-1.5 lg:gap-2 text-[15px] text-neutral-600 dark:text-[#aaaaaa]">
            <a
              href="#problem"
              className="px-3.5 py-1.5 rounded-full hover:text-neutral-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors whitespace-nowrap font-medium"
            >
              Vấn đề
            </a>
            <a
              href="#how-it-works"
              className="px-3.5 py-1.5 rounded-full hover:text-neutral-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors whitespace-nowrap font-medium"
            >
              Quy trình
            </a>
            <a
              href="#tech"
              className="px-3.5 py-1.5 rounded-full hover:text-neutral-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors whitespace-nowrap font-medium"
            >
              Công nghệ
            </a>
            <a
              href="#solutions"
              className="px-3.5 py-1.5 rounded-full hover:text-neutral-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors whitespace-nowrap font-medium"
            >
              Giải pháp
            </a>
            <a
              href="#compliance"
              className="px-3.5 py-1.5 rounded-full hover:text-neutral-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors whitespace-nowrap font-medium"
            >
              Pháp lý
            </a>
            <a
              href="#faq"
              className="px-3.5 py-1.5 rounded-full hover:text-neutral-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors whitespace-nowrap font-medium"
            >
              FAQ
            </a>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <ThemeToggle
              className="text-neutral-600 hover:text-neutral-900 hover:bg-black/5 dark:text-[#aaaaaa] dark:hover:text-white dark:hover:bg-white/10"
              iconClassName="size-4.5"
              start="top-down"
            />
            <button
              onClick={() => setDemoModalOpen(true)}
              className="hidden sm:inline-flex items-center text-[14.5px] font-medium text-neutral-700 dark:text-[#dadada] hover:text-neutral-900 dark:hover:text-white px-3.5 py-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors whitespace-nowrap shrink-0"
            >
              Đặt lịch Demo
            </button>
            <button
              onClick={onOpenApp}
              className="inline-flex items-center gap-1.5 text-[14.5px] font-semibold bg-[#a78bfa] hover:bg-[#8b7cf6] text-[#141416] px-5 py-2 rounded-full shadow-lg transition-transform active:scale-95 whitespace-nowrap shrink-0"
            >
              <span>Vào Đồ Thị Live</span>
              <ArrowRight className="size-4 shrink-0" />
            </button>
          </div>
        </nav>
      </header>

      {/* ------------------------------------------------------------ */}
      {/* 2. Hero Section (Inspired by Lindy Tile 1 & 2 + Obsidian)    */}
      {/* ------------------------------------------------------------ */}
      <section className="relative pt-36 pb-24 px-4 sm:px-6 overflow-hidden flex flex-col items-center text-center">
        {/* Subtle background atmospheric glow */}
        <div
          aria-hidden="true"
          className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[720px] h-[400px] bg-gradient-to-b from-[#a78bfa]/20 via-[#60a5fa]/10 to-transparent blur-[140px] pointer-events-none rounded-full"
        />

        {/* Left Data Stream Wing (Directly inspired by Lindy Hero Integration Stream) */}
        <div
          aria-hidden="true"
          className="hidden xl:block absolute left-0 top-24 bottom-48 w-80 pointer-events-none z-10"
        >
          {DATA_STREAM_LEFT.map((node) => {
            const Icon = node.icon;
            return (
              <div
                key={node.name}
                style={{ top: node.top, left: node.left, animationDelay: node.delay }}
                className={cn(
                  "absolute pointer-events-auto flex items-center gap-2.5 px-4 py-2 rounded-full",
                  "bg-white/90 dark:bg-[#242424]/85 backdrop-blur-md border border-neutral-200 dark:border-[#383838] shadow-md dark:shadow-[0_4px_24px_rgba(0,0,0,0.5)]",
                  "hover:scale-105 hover:border-purple-400 dark:hover:border-[#a78bfa]/70 hover:shadow-[0_0_24px_rgba(167,139,250,0.3)] transition-all duration-300",
                  node.anim,
                )}
              >
                <span
                  className="flex size-7 items-center justify-center rounded-full bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 shrink-0"
                  style={{ color: node.color }}
                >
                  <Icon className="size-3.5" />
                </span>
                <div className="text-left leading-none pr-1">
                  <div className="text-[13px] font-bold text-neutral-900 dark:text-white tracking-tight">
                    {node.name}
                  </div>
                  <div className="text-[10.5px] font-mono text-neutral-500 dark:text-[#888888] mt-0.5">
                    {node.category}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right Data Stream Wing (Directly inspired by Lindy Hero Integration Stream) */}
        <div
          aria-hidden="true"
          className="hidden xl:block absolute right-0 top-24 bottom-48 w-80 pointer-events-none z-10"
        >
          {DATA_STREAM_RIGHT.map((node) => {
            const Icon = node.icon;
            return (
              <div
                key={node.name}
                style={{ top: node.top, right: node.right, animationDelay: node.delay }}
                className={cn(
                  "absolute pointer-events-auto flex items-center gap-2.5 px-4 py-2 rounded-full",
                  "bg-white/90 dark:bg-[#242424]/85 backdrop-blur-md border border-neutral-200 dark:border-[#383838] shadow-md dark:shadow-[0_4px_24px_rgba(0,0,0,0.5)]",
                  "hover:scale-105 hover:border-purple-400 dark:hover:border-[#a78bfa]/70 hover:shadow-[0_0_24px_rgba(167,139,250,0.3)] transition-all duration-300",
                  node.anim,
                )}
              >
                <span
                  className="flex size-7 items-center justify-center rounded-full bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 shrink-0"
                  style={{ color: node.color }}
                >
                  <Icon className="size-3.5" />
                </span>
                <div className="text-left leading-none pr-1">
                  <div className="text-[13px] font-bold text-neutral-900 dark:text-white tracking-tight">
                    {node.name}
                  </div>
                  <div className="text-[10.5px] font-mono text-neutral-500 dark:text-[#888888] mt-0.5">
                    {node.category}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Eyebrow Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-purple-50 dark:bg-[#a78bfa]/10 border border-purple-200 dark:border-[#a78bfa]/30 text-purple-700 dark:text-[#a78bfa] text-[13.5px] font-medium mb-6">
          <span className="size-2 rounded-full bg-[#a78bfa] animate-ping" />
          <span>Hệ thống Trinh sát Đa phương thức & Dự báo Lan truyền thời gian thực</span>
        </div>

        {/* Display Headline with Shimmering Gradient */}
        <h1 className="max-w-5xl text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-neutral-900 dark:text-[#f7f7f7] leading-[1.12] mb-6">
          Trinh sát và dự báo sớm xu hướng mạng xã hội{" "}
          <span className="bg-gradient-to-r from-[#c084fc] via-[#a78bfa] to-[#60a5fa] bg-clip-text text-transparent animate-shimmer-gradient underline decoration-[#a78bfa]/30 underline-offset-8">
            trước khi trở thành hiện tượng đại chúng.
          </span>
        </h1>

        {/* Sub-headline */}
        <p className="max-w-3xl text-[18px] sm:text-[20px] text-neutral-600 dark:text-[#b8b8b8] leading-relaxed mb-10">
          Trendifest phân tích đa phương thức (văn bản, âm thanh, khung hình video và meme) trên
          thời gian thực, giúp thương hiệu và nhà sáng tạo nắm bắt làn sóng văn hóa Gen Z{" "}
          <strong className="text-neutral-900 dark:text-white font-medium">
            trước từ 6 đến 24 giờ
          </strong>{" "}
          — không cần chờ đến khi từ khóa đạt đỉnh tìm kiếm.
        </p>

        {/* Dual CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-4 mb-5 w-full sm:w-auto">
          <button
            onClick={onOpenApp}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 text-[16px] font-semibold bg-[#a78bfa] hover:bg-[#8b7cf6] text-[#141416] px-8 py-3.5 rounded-full shadow-[0_10px_30px_rgba(167,139,250,0.3)] transition-all hover:scale-[1.02] active:scale-[0.98] whitespace-nowrap shrink-0"
          >
            <Compass className="size-5 shrink-0" />
            <span>Trải nghiệm Đồ Thị Trực Tiếp</span>
          </button>
          <button
            onClick={() => setVideoModalOpen(true)}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 text-[16px] font-medium text-neutral-700 dark:text-[#dadada] hover:text-black dark:hover:text-white bg-white dark:bg-[#262626] hover:bg-neutral-100 dark:hover:bg-[#303030] border border-neutral-200 dark:border-[#363636] px-6 py-3.5 rounded-full transition-colors whitespace-nowrap shrink-0 shadow-sm"
          >
            <PlayCircle className="size-5 text-[#a78bfa] shrink-0" />
            <span>Xem Video Cách Hoạt Động (2 phút)</span>
          </button>
        </div>

        {/* Microcopy & Rating Badge (Lindy Hero Social Proof) */}
        <div className="flex flex-col items-center gap-2.5 mb-10">
          <div className="text-[13.5px] text-neutral-500 dark:text-[#aaaaaa]">
            Miễn phí trải nghiệm Open Source • Thiết lập trinh sát dưới 2 phút
          </div>
          <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-white/80 dark:bg-[#262626]/80 border border-neutral-200 dark:border-[#383838] shadow-md backdrop-blur text-[13px] text-neutral-800 dark:text-[#dadada]">
            <span className="flex items-center gap-0.5 text-amber-400">
              <Star className="size-3.5 fill-amber-400 text-amber-400" />
              <Star className="size-3.5 fill-amber-400 text-amber-400" />
              <Star className="size-3.5 fill-amber-400 text-amber-400" />
              <Star className="size-3.5 fill-amber-400 text-amber-400" />
              <Star className="size-3.5 fill-amber-400 text-amber-400" />
            </span>
            <span className="font-bold text-neutral-900 dark:text-white">4.9 / 5.0</span>
            <span className="text-neutral-400 dark:text-[#666]">•</span>
            <span className="text-neutral-600 dark:text-[#aaaaaa]">
              Kiểm chứng thực nghiệm trên luồng dữ liệu mở
            </span>
          </div>
        </div>

        {/* Micro-trust Proof Badges */}
        <div className="flex flex-wrap items-center justify-center gap-3 text-[14px] text-neutral-600 dark:text-[#888888] mb-12">
          <span>✓ 100% Local Vector Inference</span>
          <span>•</span>
          <span>✓ Không gửi dữ liệu cộng đồng ra ngoài</span>
          <span>•</span>
          <span>✓ Tuân thủ Luật 91/2025/QH15</span>
        </div>

        {/* ------------------------------------------------------------ */}
        {/* Visual Anchor: Interactive Trend Graph Workspace Mockup       */}
        {/* ------------------------------------------------------------ */}
        <div className="w-full max-w-5xl rounded-xl bg-white dark:bg-[#262626] border border-neutral-200 dark:border-[#363636] shadow-xl dark:shadow-2xl overflow-hidden text-left relative">
          {/* Window Chrome Titlebar */}
          <div className="flex items-center justify-between px-4 py-3 bg-neutral-100 dark:bg-[#202020] border-b border-neutral-200 dark:border-[#363636] text-[13px] text-neutral-600 dark:text-[#999999]">
            <div className="flex items-center gap-2">
              <span className="size-3 rounded-full bg-[#ff5f56]/80" />
              <span className="size-3 rounded-full bg-[#ffbd2e]/80" />
              <span className="size-3 rounded-full bg-[#27c93f]/80" />
              <span className="ms-2 font-mono text-[12.5px] text-neutral-500 dark:text-[#888888]">
                trendifest-workspace — v1.4.2 [LIVE TAIL]
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-[12px] font-mono text-purple-700 dark:text-[#a78bfa]">
                <span className="size-2 rounded-full bg-[#a78bfa] animate-ping" />
                <span>9 viewer segments active</span>
              </div>
              <div className="flex bg-neutral-200 dark:bg-[#1a1a1a] rounded p-0.5 border border-neutral-300 dark:border-[#333333] text-[12px]">
                {["24h", "3d", "7d"].map((w) => (
                  <button
                    key={w}
                    onClick={() => setGraphWindow(w)}
                    className={cn(
                      "px-2.5 py-0.5 rounded transition-colors",
                      graphWindow === w
                        ? "bg-[#a78bfa] text-black font-semibold"
                        : "text-neutral-600 dark:text-[#777777] hover:text-black dark:hover:text-white",
                    )}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Dedicated Top Alert Banner: Never covers graph nodes */}
          <div className="bg-purple-50/80 dark:bg-[#1f1929] border-b border-purple-100 dark:border-[#3d2f52] px-4 py-3 flex items-center justify-between flex-wrap gap-2 text-[13.5px]">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-300 font-mono text-[11.5px] font-bold uppercase tracking-wider">
                <span className="size-1.5 rounded-full bg-rose-500 animate-pulse" />
                <span>T - 18h Early Alert</span>
              </span>
              <span className="text-neutral-800 dark:text-[#dadada] text-[14.5px]">
                Mẫu âm thanh{" "}
                <strong className="text-purple-700 dark:text-[#a78bfa] font-mono">
                  capcut_remix_09
                </strong>{" "}
                có{" "}
                <strong className="text-emerald-600 dark:text-emerald-400 font-semibold">
                  74% xác suất bùng nổ
                </strong>{" "}
                trong 12 giờ tới.
              </span>
            </div>
            <div className="flex items-center gap-3 text-[12.5px] font-mono text-neutral-600 dark:text-[#999999]">
              <span className="text-neutral-500 dark:text-[#888888]">
                Dịch chuyển:{" "}
                <span className="text-neutral-900 dark:text-white font-medium">
                  Gaming ➔ Shitposting
                </span>
              </span>
              <span className="text-neutral-400 dark:text-[#555]">•</span>
              <span className="text-emerald-600 dark:text-emerald-400">+42 tác giả độc lập</span>
            </div>
          </div>

          {/* Main Workspace Body: Canvas + Dedicated Inspector Pane */}
          <div className="flex flex-col md:flex-row bg-neutral-100 dark:bg-[#1a1a1a]">
            {/* Center Canvas Area: Completely Unobstructed Graph */}
            <div className="flex-1 relative min-h-[380px] sm:min-h-[440px] bg-neutral-50 dark:bg-[#1e1e1e] p-4 flex flex-col justify-between overflow-hidden">
              {/* Subtle background grid pattern */}
              <div
                aria-hidden="true"
                className="absolute inset-0 opacity-[0.05] pointer-events-none"
                style={{
                  backgroundImage: "radial-gradient(currentColor 1px, transparent 1px)",
                  backgroundSize: "20px 20px",
                }}
              />

              {/* Unobstructed SVG Graph Network */}
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                viewBox="0 0 650 420"
                preserveAspectRatio="xMidYMid meet"
              >
                <defs>
                  <linearGradient id="linkGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.4" />
                  </linearGradient>
                  <radialGradient id="nodeGlow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
                  </radialGradient>
                </defs>

                {/* Satellite minor connections */}
                <line
                  x1="80"
                  y1="120"
                  x2="140"
                  y2="190"
                  className="stroke-neutral-300 dark:stroke-white/10"
                  strokeWidth="1"
                />
                <line
                  x1="90"
                  y1="260"
                  x2="140"
                  y2="190"
                  className="stroke-neutral-300 dark:stroke-white/10"
                  strokeWidth="1"
                />
                <line
                  x1="430"
                  y1="70"
                  x2="460"
                  y2="130"
                  className="stroke-neutral-300 dark:stroke-white/10"
                  strokeWidth="1"
                />
                <line
                  x1="550"
                  y1="110"
                  x2="460"
                  y2="130"
                  className="stroke-neutral-300 dark:stroke-white/10"
                  strokeWidth="1"
                />
                <line
                  x1="260"
                  y1="360"
                  x2="280"
                  y2="300"
                  className="stroke-neutral-300 dark:stroke-white/10"
                  strokeWidth="1"
                />
                <line
                  x1="330"
                  y1="350"
                  x2="280"
                  y2="300"
                  className="stroke-neutral-300 dark:stroke-white/10"
                  strokeWidth="1"
                />
                <line
                  x1="570"
                  y1="270"
                  x2="520"
                  y2="230"
                  className="stroke-neutral-300 dark:stroke-white/10"
                  strokeWidth="1"
                />

                {/* Inter-hub connections */}
                <line
                  x1="140"
                  y1="190"
                  x2="280"
                  y2="300"
                  className="stroke-neutral-300 dark:stroke-white/15"
                  strokeWidth="1.5"
                />
                <line
                  x1="280"
                  y1="300"
                  x2="520"
                  y2="230"
                  className="stroke-neutral-300 dark:stroke-white/15"
                  strokeWidth="1.5"
                />
                <line
                  x1="520"
                  y1="230"
                  x2="460"
                  y2="130"
                  className="stroke-neutral-300 dark:stroke-white/15"
                  strokeWidth="1.5"
                />

                {/* Primary Diffusion Bridge: Gaming -> capcut_remix_09 -> Shitposting */}
                <line
                  x1="140"
                  y1="190"
                  x2="280"
                  y2="150"
                  stroke="#8b5cf6"
                  strokeWidth="2.5"
                  strokeDasharray="8 4"
                  className="animate-dash-stream"
                />
                <line
                  x1="280"
                  y1="150"
                  x2="460"
                  y2="130"
                  stroke="url(#linkGrad)"
                  strokeWidth="2.5"
                  strokeDasharray="8 4"
                  className="animate-dash-stream"
                />
                <line
                  x1="280"
                  y1="150"
                  x2="280"
                  y2="300"
                  stroke="#a78bfa"
                  strokeOpacity="0.5"
                  strokeWidth="1.5"
                  strokeDasharray="6 3"
                  className="animate-dash-stream"
                />

                {/* Community Hub Nodes (All 4 hubs animated with gentle aura rings) */}
                {/* 1. Gaming Community */}
                <g>
                  <circle
                    cx="140"
                    cy="190"
                    r="22"
                    className="fill-white dark:fill-[#242424] stroke-neutral-300 dark:stroke-[#4a4a4a]"
                    strokeWidth="2"
                  />
                  <circle
                    cx="140"
                    cy="190"
                    r="12"
                    fill="#60a5fa"
                    fillOpacity="0.2"
                    className="animate-ping"
                    style={{ animationDuration: "3.2s" }}
                  />
                  <circle cx="140" cy="190" r="6" fill="#60a5fa" />
                  <text
                    x="140"
                    y="226"
                    textAnchor="middle"
                    className="fill-neutral-900 dark:fill-[#cccccc] text-[13px] font-semibold"
                  >
                    Gaming Hub
                  </text>
                  <text
                    x="140"
                    y="242"
                    textAnchor="middle"
                    className="fill-neutral-500 dark:fill-[#888888] text-[11px]"
                  >
                    128 node
                  </text>
                </g>

                {/* 2. Shitposting & Meme Community */}
                <g>
                  <circle
                    cx="460"
                    cy="130"
                    r="24"
                    className="fill-white dark:fill-[#242424] stroke-neutral-300 dark:stroke-[#4a4a4a]"
                    strokeWidth="2"
                  />
                  <circle
                    cx="460"
                    cy="130"
                    r="14"
                    fill="#f59e0b"
                    fillOpacity="0.2"
                    className="animate-ping"
                    style={{ animationDuration: "2.6s" }}
                  />
                  <circle cx="460" cy="130" r="7" fill="#f59e0b" />
                  <text
                    x="460"
                    y="168"
                    textAnchor="middle"
                    className="fill-neutral-900 dark:fill-[#cccccc] text-[13px] font-semibold"
                  >
                    Shitposting & Meme
                  </text>
                  <text
                    x="460"
                    y="184"
                    textAnchor="middle"
                    className="fill-neutral-500 dark:fill-[#888888] text-[11px]"
                  >
                    312 node
                  </text>
                </g>

                {/* 3. Music & Audio Community */}
                <g>
                  <circle
                    cx="280"
                    cy="300"
                    r="20"
                    className="fill-white dark:fill-[#242424] stroke-neutral-300 dark:stroke-[#4a4a4a]"
                    strokeWidth="2"
                  />
                  <circle
                    cx="280"
                    cy="300"
                    r="11"
                    fill="#34d399"
                    fillOpacity="0.2"
                    className="animate-ping"
                    style={{ animationDuration: "3.8s" }}
                  />
                  <circle cx="280" cy="300" r="5" fill="#34d399" />
                  <text
                    x="280"
                    y="334"
                    textAnchor="middle"
                    className="fill-neutral-900 dark:fill-[#cccccc] text-[13px] font-semibold"
                  >
                    Music & Beat
                  </text>
                  <text
                    x="280"
                    y="350"
                    textAnchor="middle"
                    className="fill-neutral-500 dark:fill-[#888888] text-[11px]"
                  >
                    94 node
                  </text>
                </g>

                {/* 4. Campus / Gen Z Community */}
                <g>
                  <circle
                    cx="520"
                    cy="230"
                    r="18"
                    className="fill-white dark:fill-[#242424] stroke-neutral-300 dark:stroke-[#4a4a4a]"
                    strokeWidth="1.5"
                  />
                  <circle
                    cx="520"
                    cy="230"
                    r="10"
                    fill="#a78bfa"
                    fillOpacity="0.2"
                    className="animate-ping"
                    style={{ animationDuration: "3s" }}
                  />
                  <circle cx="520" cy="230" r="5" fill="#a78bfa" />
                  <text
                    x="520"
                    y="260"
                    textAnchor="middle"
                    className="fill-neutral-900 dark:fill-[#aaaaaa] text-[12px] font-semibold"
                  >
                    Đời sống Gen Z
                  </text>
                </g>

                {/* Satellite small nodes */}
                <circle cx="80" cy="120" r="4" className="fill-neutral-400 dark:fill-[#555]" />
                <circle cx="90" cy="260" r="4" className="fill-neutral-400 dark:fill-[#555]" />
                <circle cx="430" cy="70" r="4" className="fill-neutral-400 dark:fill-[#555]" />
                <circle cx="550" cy="110" r="4" className="fill-neutral-400 dark:fill-[#555]" />
                <circle cx="260" cy="360" r="4" className="fill-neutral-400 dark:fill-[#555]" />
                <circle cx="330" cy="350" r="4" className="fill-neutral-400 dark:fill-[#555]" />
                <circle cx="570" cy="270" r="4" className="fill-neutral-400 dark:fill-[#555]" />

                {/* High Potential Emerging Pattern: capcut_remix_09 with Radar Rings */}
                <circle cx="280" cy="150" r="44" fill="url(#nodeGlow)" />
                <circle
                  cx="280"
                  cy="150"
                  r="28"
                  fill="#a78bfa"
                  fillOpacity="0.2"
                  className="animate-ping"
                  style={{ animationDuration: "2.8s" }}
                />
                <g className="animate-pulse">
                  <circle cx="280" cy="150" r="18" fill="#a78bfa" fillOpacity="0.35" />
                  <circle
                    cx="280"
                    cy="150"
                    r="10"
                    fill="#a78bfa"
                    stroke="#ffffff"
                    strokeWidth="2.5"
                  />
                </g>
                <text
                  x="280"
                  y="118"
                  textAnchor="middle"
                  className="fill-neutral-900 dark:fill-white font-mono font-bold text-[14px]"
                >
                  capcut_remix_09
                </text>
                <text
                  x="280"
                  y="134"
                  textAnchor="middle"
                  className="fill-purple-700 dark:fill-[#c4b5fd] text-[12px] font-medium"
                >
                  Hawkes: 74% • Tín hiệu mới chớm
                </text>
              </svg>

              {/* Canvas Bottom Legend Overlay */}
              <div className="relative z-10 mt-auto pt-4 flex flex-wrap items-center justify-between gap-3 text-[12.5px] text-neutral-600 dark:text-[#999999]">
                <div className="flex items-center gap-3 bg-white/90 dark:bg-[#262626]/90 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-[#333333] backdrop-blur shadow-sm">
                  <span className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full bg-[#a78bfa]" />
                    <span className="text-neutral-800 dark:text-neutral-200">
                      Tín hiệu bộc phát
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full bg-neutral-400 dark:bg-[#4a4a4a]" />
                    <span className="text-neutral-800 dark:text-neutral-200">Cụm cộng đồng</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3.5 h-0.5 bg-[#a78bfa]" />
                    <span className="text-neutral-800 dark:text-neutral-200">
                      Di chuyển xuyên nhóm
                    </span>
                  </span>
                </div>
                <div className="text-[12px] font-mono text-neutral-500 dark:text-[#777777] hidden sm:block">
                  Complete-linkage Event Graph • Cosine 0.81
                </div>
              </div>
            </div>

            {/* Right Inspector Panel (Dedicated Obsidian-style inspector) */}
            <div className="w-full md:w-80 lg:w-96 border-t md:border-t-0 md:border-l border-neutral-200 dark:border-[#363636] bg-neutral-50 dark:bg-[#222222] p-5 flex flex-col justify-between gap-4">
              <div>
                {/* Inspector Header */}
                <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-[#333333] mb-3">
                  <div className="flex items-center gap-2">
                    <Layers className="size-4.5 text-[#a78bfa]" />
                    <span className="text-[13.5px] font-bold uppercase tracking-wider text-neutral-700 dark:text-[#cccccc]">
                      Trắc diện tín hiệu
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-mono text-[11px] font-semibold">
                    <span className="size-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
                    BURSTING
                  </span>
                </div>

                {/* Node Identity */}
                <div className="mb-3.5">
                  <div className="text-[17px] font-bold text-neutral-900 dark:text-white font-mono flex items-center gap-1.5">
                    <span>capcut_remix_09</span>
                  </div>
                  <div className="text-[13.5px] text-neutral-600 dark:text-[#aaaaaa] mt-0.5">
                    Âm thanh phái sinh & mẫu dựng CapCut đang bộc phát
                  </div>
                </div>

                {/* Hawkes Forecast Gauge Card */}
                <div className="p-3.5 rounded-lg bg-white dark:bg-[#282828] border border-neutral-200 dark:border-[#383838] mb-3.5 shadow-sm">
                  <div className="flex items-center justify-between text-[13px] mb-2">
                    <span className="text-neutral-700 dark:text-[#cccccc] font-medium">
                      Xác suất bùng nổ (12h)
                    </span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold font-mono text-[15px]">
                      74%
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full h-2.5 bg-neutral-100 dark:bg-[#1a1a1a] rounded-full overflow-hidden border border-neutral-200 dark:border-[#333]">
                    <div
                      className="h-full bg-gradient-to-r from-[#a78bfa] to-emerald-400 rounded-full"
                      style={{ width: "74%" }}
                    />
                  </div>
                  <div className="flex justify-between text-[11.5px] text-neutral-500 dark:text-[#888888] font-mono mt-1.5">
                    <span>Mô hình Hawkes Process</span>
                    <span>CI: 68% - 81%</span>
                  </div>
                </div>

                {/* Metrics 2x2 Grid */}
                <div className="grid grid-cols-2 gap-2.5 mb-3.5">
                  <div className="p-3 rounded-lg bg-white dark:bg-[#262626] border border-neutral-200 dark:border-[#333333] shadow-sm">
                    <div className="text-[11px] uppercase tracking-wider text-neutral-500 dark:text-[#888888]">
                      Tác giả độc lập
                    </div>
                    <div className="text-[16px] font-bold text-neutral-900 dark:text-white font-mono mt-1">
                      +42 tác giả
                    </div>
                    <div className="text-[11.5px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                      Không phải bot spam
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-white dark:bg-[#262626] border border-neutral-200 dark:border-[#333333] shadow-sm">
                    <div className="text-[11px] uppercase tracking-wider text-neutral-500 dark:text-[#888888]">
                      Gia tốc tăng
                    </div>
                    <div className="text-[16px] font-bold text-neutral-900 dark:text-white font-mono mt-1">
                      +320%
                    </div>
                    <div className="text-[11.5px] text-neutral-500 dark:text-[#999999] mt-0.5">
                      trong 20 phút qua
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-white dark:bg-[#262626] border border-neutral-200 dark:border-[#333333] shadow-sm">
                    <div className="text-[11px] uppercase tracking-wider text-neutral-500 dark:text-[#888888]">
                      Vân tay âm thanh
                    </div>
                    <div className="text-[14.5px] font-semibold text-neutral-800 dark:text-[#dadada] font-mono mt-1">
                      PeakNetFP
                    </div>
                    <div className="text-[11.5px] text-neutral-500 dark:text-[#999999] mt-0.5">
                      Độ khớp: 0.81
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-white dark:bg-[#262626] border border-neutral-200 dark:border-[#333333] shadow-sm">
                    <div className="text-[11px] uppercase tracking-wider text-neutral-500 dark:text-[#888888]">
                      Di chuyển
                    </div>
                    <div className="text-[14.5px] font-semibold text-purple-700 dark:text-[#a78bfa] mt-1">
                      Vượt biên ngách
                    </div>
                    <div className="text-[11.5px] text-neutral-500 dark:text-[#999999] mt-0.5">
                      Gaming → Shitpost
                    </div>
                  </div>
                </div>

                {/* Grounding Evidence Quote */}
                <div className="p-3 rounded-lg bg-white dark:bg-[#1f1f1f] border border-neutral-200 dark:border-[#333333] text-[13px] shadow-sm">
                  <div className="text-[11px] uppercase tracking-wider text-neutral-500 dark:text-[#888888] mb-1.5 flex items-center justify-between">
                    <span>Minh chứng kiểm chứng (Grounding)</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-mono">
                      T0 Signal
                    </span>
                  </div>
                  <p className="text-neutral-800 dark:text-[#dadada] italic leading-snug">
                    "Ủa rồi ai mượn remix đoạn này mượt dữ vậy..."
                  </p>
                  <div className="mt-1.5 text-[11.5px] text-neutral-500 dark:text-[#888888] font-mono">
                    — @beatmaker_viet.bsky.social • Bluesky Jetstream v2
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <button
                onClick={onOpenApp}
                className="w-full inline-flex items-center justify-center gap-1.5 text-[14.5px] font-semibold bg-[#a78bfa] hover:bg-[#8b7cf6] text-[#141416] py-3 px-4 rounded-lg shadow transition-all active:scale-[0.98]"
              >
                <span>Xem trên Đồ Thị Live</span>
                <ArrowUpRight className="size-4.5 shrink-0" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ */}
      {/* 3. Market Stats & Scale Proof (Inspired by Lindy Tile 2)     */}
      {/* ------------------------------------------------------------ */}
      <section className="py-20 border-y border-neutral-200 dark:border-[#363636] bg-neutral-100/70 dark:bg-[#222222]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {MARKET_STATS.map((stat) => (
              <div
                key={stat.label}
                className="p-7 rounded-xl border border-neutral-200 dark:border-[#363636] bg-white dark:bg-[#262626] transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-purple-300 dark:hover:border-[#a78bfa]/50"
              >
                <div className="text-4xl sm:text-5xl font-extrabold text-neutral-900 dark:text-[#f7f7f7] tracking-tight mb-2.5">
                  {stat.value}
                </div>
                <div className="text-[17px] font-bold text-neutral-800 dark:text-[#dadada] mb-2">
                  {stat.label}
                </div>
                <div className="text-[15px] text-neutral-600 dark:text-[#999999] leading-relaxed">
                  {stat.description}
                </div>
              </div>
            ))}
          </div>

          {/* Protocol & Data Sources Proof Bar */}
          <div className="mt-14 pt-8 border-t border-neutral-200 dark:border-[#333333] flex flex-col md:flex-row items-center justify-between gap-6 text-[14px] text-neutral-600 dark:text-[#888888]">
            <span className="uppercase tracking-wider font-semibold text-[13px] text-neutral-500 dark:text-[#aaaaaa]">
              Nguồn cấp dữ liệu & Chuẩn giao thức mở:
            </span>
            <div className="flex flex-wrap items-center gap-6 sm:gap-10 text-neutral-700 dark:text-[#bbbbbb] font-medium text-[14.5px]">
              <span>Bluesky AT Protocol</span>
              <span>Meta Threads API</span>
              <span>TikTok Research API</span>
              <span>HuggingFace Local AI</span>
              <span>Hawkes Point Process</span>
              <span>PyTorch Vector Space</span>
            </div>
          </div>

          {/* Audience Segments Bar */}
          <div className="mt-14 pt-8 border-t border-neutral-200 dark:border-[#333333]">
            <div className="text-center mb-7">
              <span className="uppercase tracking-wider font-mono text-[13px] text-purple-700 dark:text-[#a78bfa] font-semibold">
                Phân tầng Khán giả Thực chứng (Viewer Segments)
              </span>
              <h3 className="text-xl sm:text-2xl font-bold text-neutral-900 dark:text-white mt-1.5">
                Quan sát trực tiếp luồng văn hóa ngách thay vì suy đoán nhân khẩu học
              </h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
              {AUDIENCE_SEGMENTS.map((seg) => {
                const Icon = seg.icon;
                return (
                  <div
                    key={seg.id}
                    className="p-4 rounded-xl bg-white dark:bg-[#262626] border border-neutral-200 dark:border-[#363636] hover:border-purple-300 dark:hover:border-[#a78bfa]/50 transition-colors text-center flex flex-col items-center shadow-sm"
                  >
                    <span
                      className="flex size-10 items-center justify-center rounded-lg bg-neutral-100 dark:bg-white/5 mb-2.5"
                      style={{ color: seg.color }}
                    >
                      <Icon className="size-5" />
                    </span>
                    <span className="text-[14px] font-bold text-neutral-900 dark:text-white mb-1.5">
                      {seg.name}
                    </span>
                    <span className="text-[12.5px] text-neutral-600 dark:text-[#999999] leading-snug line-clamp-2">
                      {seg.desc}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ */}
      {/* 4. Problem & Comparison: Old vs. Trendifest                  */}
      {/* ------------------------------------------------------------ */}
      <section id="problem" className="py-24 px-4 sm:px-6 max-w-6xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-1.5 text-[13px] uppercase font-mono tracking-wider text-[#a78bfa] mb-3 font-semibold">
            <Clock className="size-4" />
            <span>Bài toán thời điểm sống còn</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-neutral-900 dark:text-white tracking-tight mb-5 leading-tight">
            Tại sao các công cụ Social Listening truyền thống đang làm bạn bỏ lỡ đỉnh sóng?
          </h2>
          <p className="text-[17px] sm:text-[18px] text-neutral-600 dark:text-[#aaaaaa] leading-relaxed">
            Khi một từ khóa lọt vào bảng xếp hạng Google Trends, đối thủ đã ồ ạt đổ ngân sách quảng
            cáo và cộng đồng đã bắt đầu bội thực. Bạn cần nhìn thấy tia lửa từ lúc mới nhen nhóm,
            không phải lúc đám cháy đã tắt.
          </p>
        </div>

        {/* Comparison Table / Cards */}
        <div className="overflow-hidden rounded-2xl border border-neutral-200 dark:border-[#363636] bg-white dark:bg-[#262626] shadow-md">
          <div className="grid grid-cols-1 md:grid-cols-12 border-b border-neutral-200 dark:border-[#363636] bg-neutral-50 dark:bg-[#222222] p-5 text-[15px] font-bold text-neutral-600 dark:text-[#888888] hidden md:grid">
            <div className="col-span-3">Tiêu chí đánh giá</div>
            <div className="col-span-4 text-rose-500 dark:text-rose-300">
              Công cụ truyền thống / Google Trends
            </div>
            <div className="col-span-5 text-[#7c3aed] dark:text-[#a78bfa]">
              Giải pháp Đột phá Trendifest
            </div>
          </div>

          <div className="divide-y divide-neutral-200 dark:divide-[#363636]">
            {COMPARISON_ROWS.map((row, idx) => (
              <div
                key={idx}
                className="grid grid-cols-1 md:grid-cols-12 p-5 sm:p-6 gap-3 sm:gap-5 items-start text-[15px]"
              >
                <div className="md:col-span-3 font-bold text-neutral-900 dark:text-white flex items-center gap-2.5 text-[16px]">
                  <span className="size-2 rounded-full bg-[#a78bfa]" />
                  <span>{row.criteria}</span>
                </div>
                <div className="md:col-span-4 text-neutral-600 dark:text-[#aaaaaa] bg-neutral-50 dark:bg-[#1e1e1e]/60 p-3.5 rounded-lg md:bg-transparent md:p-0 leading-relaxed">
                  <span className="md:hidden block text-[12px] uppercase font-bold text-rose-500 dark:text-rose-400 mb-1">
                    Cách làm cũ:
                  </span>
                  {row.traditional}
                </div>
                <div className="md:col-span-5 text-neutral-900 dark:text-[#f7f7f7] bg-purple-50 dark:bg-[#2a2438]/50 border border-purple-200 dark:border-[#a78bfa]/30 p-3.5 rounded-lg md:bg-transparent md:border-0 md:p-0 leading-relaxed font-normal">
                  <span className="md:hidden block text-[12px] uppercase font-bold text-[#a78bfa] mb-1">
                    Trendifest:
                  </span>
                  {row.trendifest}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ */}
      {/* 5. How It Works: Timeline & Storytelling (Lindy Tile 3 & 4)   */}
      {/* ------------------------------------------------------------ */}
      <section
        id="how-it-works"
        className="py-24 px-4 sm:px-6 bg-neutral-100/70 dark:bg-[#222222] border-y border-neutral-200 dark:border-[#363636]"
      >
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="inline-flex items-center gap-1.5 text-[13px] uppercase font-mono tracking-wider text-purple-700 dark:text-[#a78bfa] mb-3 font-semibold">
              <History className="size-4" />
              <span>Quy trình trinh sát liên hoàn</span>
            </div>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-neutral-900 dark:text-white tracking-tight mb-5 leading-tight">
              Từ một đốm lửa trong cộng đồng ngách đến trào lưu triệu view
            </h2>
            <p className="text-[17px] sm:text-[18px] text-neutral-600 dark:text-[#aaaaaa] leading-relaxed">
              Cách Trendifest thu thập, phân tích đa phương thức và dự báo xác suất bùng nổ trong
              từng mốc thời gian thực chiến.
            </p>
          </div>

          {/* 4-Step Progressive Timeline Cards (Interactive Step Selection) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {TIMELINE_STEPS.map((step, idx) => {
              const isSelected = activeTimelineStep === idx;
              return (
                <div
                  key={idx}
                  onClick={() => setActiveTimelineStep(idx)}
                  className={cn(
                    "flex flex-col justify-between p-6 sm:p-7 rounded-2xl border transition-all duration-300 cursor-pointer text-left relative",
                    isSelected
                      ? "bg-purple-50/90 dark:bg-[#2c243d] border-purple-500 dark:border-[#a78bfa] shadow-[0_0_30px_rgba(167,139,250,0.25)] -translate-y-1.5 ring-1 ring-purple-400 dark:ring-[#a78bfa]/50"
                      : "bg-white dark:bg-[#262626] border-neutral-200 dark:border-[#363636] hover:border-purple-300 dark:hover:border-[#a78bfa]/50 hover:-translate-y-1 shadow-sm",
                  )}
                >
                  {isSelected && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-[#a78bfa] text-[#141416] text-[11px] font-bold uppercase tracking-wider shadow">
                      Đang khảo sát
                    </span>
                  )}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-3xl font-black font-mono text-purple-700 dark:text-[#a78bfa]">
                        {step.time}
                      </span>
                      <span
                        className={cn(
                          "text-[12px] font-mono px-2.5 py-0.5 rounded border",
                          isSelected
                            ? "bg-purple-100 text-purple-800 border-purple-300 dark:bg-[#a78bfa]/20 dark:text-[#a78bfa] dark:border-[#a78bfa]/40 font-semibold"
                            : "bg-neutral-100 text-neutral-600 border-neutral-200 dark:bg-[#1a1a1a] dark:text-[#888888] dark:border-[#333333]",
                        )}
                      >
                        Bước 0{idx + 1}
                      </span>
                    </div>
                    <div className="inline-block text-[13px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded mb-3">
                      {step.badge}
                    </div>
                    <h3 className="text-[18px] font-bold text-neutral-900 dark:text-white mb-2.5 leading-snug">
                      {step.title}
                    </h3>
                    <p className="text-[15px] text-neutral-600 dark:text-[#aaaaaa] leading-relaxed mb-5">
                      {step.description}
                    </p>
                  </div>

                  <div className="pt-4 border-t border-neutral-200 dark:border-[#333333] text-[13.5px] font-mono text-purple-700 dark:text-[#c4b5fd]">
                    {step.signal}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Active Step Telemetry Deep-dive Bar */}
          <div className="mt-8 p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#262626] border border-neutral-200 dark:border-[#383838] flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-purple-100 dark:bg-[#a78bfa]/20 text-purple-700 dark:text-[#a78bfa] shrink-0">
                <Sparkles className="size-5 animate-pulse" />
              </span>
              <div>
                <div className="text-[12.5px] font-mono uppercase tracking-wider text-purple-700 dark:text-[#a78bfa] font-semibold">
                  Mô phỏng dữ liệu thời gian thực: {TIMELINE_STEPS[activeTimelineStep].time}
                </div>
                <div className="text-[15.5px] font-semibold text-neutral-900 dark:text-white mt-0.5">
                  {TIMELINE_STEPS[activeTimelineStep].title} —{" "}
                  {TIMELINE_STEPS[activeTimelineStep].signal}
                </div>
              </div>
            </div>
            <button
              onClick={onOpenApp}
              className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-purple-700 dark:text-[#a78bfa] hover:text-purple-900 dark:hover:text-white px-4 py-2 rounded-lg bg-purple-50 dark:bg-white/5 hover:bg-purple-100 dark:hover:bg-white/10 transition-colors whitespace-nowrap shrink-0"
            >
              <span>Xem trực quan trên Map</span>
              <ArrowRight className="size-4" />
            </button>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ */}
      {/* 6. 4 Core Tech Pillars (Weak Signal, Multimodal, Hawkes...) */}
      {/* ------------------------------------------------------------ */}
      <section id="tech" className="py-24 px-4 sm:px-6 max-w-6xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-1.5 text-[13px] uppercase font-mono tracking-wider text-[#a78bfa] mb-3 font-semibold">
            <Cpu className="size-4" />
            <span>Nền tảng kỹ thuật chuyên sâu</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-neutral-900 dark:text-white tracking-tight mb-5 leading-tight">
            Bốn Trụ Cột Công Nghệ Đột Phá
          </h2>
          <p className="text-[17px] sm:text-[18px] text-neutral-600 dark:text-[#aaaaaa] leading-relaxed">
            Hệ thống ứng dụng mô hình hóa toán học xác suất và kiến trúc AI đa phương thức cục bộ,
            đảm bảo tính khoa học và minh bạch cao nhất.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {TECH_PILLARS.map((pillar) => {
            const Icon = pillar.icon;
            return (
              <div
                key={pillar.number}
                className="p-8 rounded-2xl bg-white dark:bg-[#262626] border border-neutral-200 dark:border-[#363636] hover:border-[#a78bfa]/60 hover:-translate-y-1.5 hover:shadow-[0_12px_30px_rgba(167,139,250,0.12)] transition-all duration-300 flex flex-col justify-between group shadow-sm"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="flex size-11 items-center justify-center rounded-lg bg-[#a78bfa]/15 border border-[#a78bfa]/30 text-[#a78bfa] group-hover:scale-110 group-hover:bg-[#a78bfa]/25 transition-all duration-300">
                      <Icon className="size-5.5" />
                    </span>
                    <span className="font-mono text-3xl font-bold text-neutral-300 dark:text-[#555555] group-hover:text-[#a78bfa]/50 transition-colors duration-300">
                      {pillar.number}
                    </span>
                  </div>
                  <h3 className="text-[19px] font-bold text-neutral-900 dark:text-white mb-3 leading-snug">
                    {pillar.title}
                  </h3>
                  <p className="text-[15.5px] text-neutral-600 dark:text-[#aaaaaa] leading-relaxed mb-6">
                    {pillar.description}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 pt-4 border-t border-neutral-200 dark:border-[#363636]">
                  {pillar.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[13px] font-mono px-2.5 py-1 rounded bg-neutral-100 dark:bg-[#1e1e1e] text-neutral-700 dark:text-[#cccccc] border border-neutral-200 dark:border-[#333333]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ------------------------------------------------------------ */}
      {/* 7. Target Personas & Interactive Use Cases (Lindy Tile 5)   */}
      {/* ------------------------------------------------------------ */}
      <section
        id="solutions"
        className="py-24 px-4 sm:px-6 bg-neutral-100/70 dark:bg-[#222222] border-y border-neutral-200 dark:border-[#363636]"
      >
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <div className="inline-flex items-center gap-1.5 text-[13px] uppercase font-mono tracking-wider text-[#a78bfa] mb-3 font-semibold">
              <Users className="size-4" />
              <span>Giải pháp cho từng đối tượng</span>
            </div>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-neutral-900 dark:text-white tracking-tight mb-5 leading-tight">
              Trendifest dành cho những ai cần đi trước thị trường?
            </h2>
            <p className="text-[17px] sm:text-[18px] text-neutral-600 dark:text-[#aaaaaa] leading-relaxed">
              Chọn vai trò của bạn để khám phá kịch bản ứng dụng cụ thể.
            </p>
          </div>

          {/* Interactive Filter Pills (Lindy Tile 5 style) */}
          <div className="flex flex-wrap justify-center gap-2.5 mb-12">
            {USE_CASES.map((uc) => (
              <button
                key={uc.id}
                onClick={() => setActiveUseCase(uc.id)}
                className={cn(
                  "px-5 py-2.5 rounded-full text-[15px] font-medium transition-all whitespace-nowrap",
                  activeUseCase === uc.id
                    ? "bg-[#a78bfa] text-[#141416] font-bold shadow-lg"
                    : "bg-white dark:bg-[#262626] text-neutral-600 dark:text-[#aaaaaa] hover:text-neutral-900 dark:hover:text-white border border-neutral-200 dark:border-[#363636] hover:bg-neutral-50 dark:hover:bg-[#303030]",
                )}
              >
                {uc.tab}
              </button>
            ))}
          </div>

          {/* Dynamic Active Use Case Display */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center bg-white dark:bg-[#262626] border border-neutral-200 dark:border-[#363636] rounded-3xl p-7 sm:p-12 shadow-xl">
            {/* Left Content */}
            <div className="lg:col-span-7">
              <div className="inline-block text-[13px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-md mb-4">
                {currentUseCase.metric}
              </div>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-neutral-900 dark:text-white mb-4 leading-snug">
                {currentUseCase.headline}
              </h3>
              <p className="text-[16px] text-neutral-600 dark:text-[#aaaaaa] leading-relaxed mb-7">
                {currentUseCase.description}
              </p>
              <ul className="space-y-3.5">
                {currentUseCase.points.map((pt, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 text-[15.5px] text-neutral-800 dark:text-[#dddddd] leading-relaxed"
                  >
                    <CheckCircle2 className="size-5 text-[#a78bfa] shrink-0 mt-0.5" />
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Right Screen Mockup */}
            <div className="lg:col-span-5 rounded-2xl bg-neutral-50 dark:bg-[#1e1e1e] border border-neutral-200 dark:border-[#363636] p-6 shadow-inner">
              <div className="flex items-center justify-between mb-5 pb-3 border-b border-neutral-200 dark:border-[#333333]">
                <span className="text-[14px] font-bold text-neutral-900 dark:text-white">
                  {currentUseCase.previewTitle}
                </span>
                <span className="text-[12px] font-mono text-purple-700 dark:text-[#a78bfa] bg-purple-100 dark:bg-[#a78bfa]/15 px-2.5 py-0.5 rounded font-medium">
                  {currentUseCase.previewBadge}
                </span>
              </div>
              <div className="space-y-3.5">
                <div className="p-3.5 rounded-xl bg-white dark:bg-[#262626] border border-neutral-200 dark:border-[#3a3a3a] shadow-sm">
                  <div className="text-[12.5px] text-neutral-500 dark:text-[#888888] mb-1">
                    Cụm sự kiện theo dõi:
                  </div>
                  <div className="text-[15px] font-semibold text-neutral-900 dark:text-white">
                    {currentUseCase.previewEvent}
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-white dark:bg-[#262626] border border-neutral-200 dark:border-[#3a3a3a] flex items-center justify-between shadow-sm">
                  <span className="text-[12.5px] text-neutral-500 dark:text-[#888888]">
                    Quỹ đạo lan truyền:
                  </span>
                  <span className="text-[14px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                    {currentUseCase.previewCommunity}
                  </span>
                </div>
                <div className="p-3.5 rounded-xl bg-purple-50 dark:bg-[#2a2438] border border-purple-200 dark:border-[#a78bfa]/30 text-center">
                  <button
                    onClick={onOpenApp}
                    className="text-[14px] font-bold text-purple-700 dark:text-[#a78bfa] hover:text-purple-900 dark:hover:text-white flex items-center justify-center gap-1.5 w-full py-1"
                  >
                    <span>Khám phá trào lưu này trên Live Map</span>
                    <ArrowRight className="size-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ */}
      {/* 8. Interactive Graph Canvas Preview Section                  */}
      {/* ------------------------------------------------------------ */}
      <section className="py-24 px-4 sm:px-6 max-w-6xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-1.5 text-[13px] uppercase font-mono tracking-wider text-[#a78bfa] mb-3 font-semibold">
            <Layers className="size-4" />
            <span>Giao diện phân tích đột phá</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-neutral-900 dark:text-white tracking-tight mb-5 leading-tight">
            Bàn làm việc phân tích: Nơi đồ thị chính là toàn bộ ứng dụng
          </h2>
          <p className="text-[17px] sm:text-[18px] text-neutral-600 dark:text-[#aaaaaa] leading-relaxed">
            Không cần chuyển đổi qua lại giữa hàng chục dashboard rối mắt. Mọi quan hệ văn hóa mạng
            đều hiển thị trong một đồ thị Obsidian canvas tối giản, mượt mà:
          </p>
        </div>

        {/* Visual Vocabulary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
          <div className="p-6 rounded-2xl bg-white dark:bg-[#262626] border border-neutral-200 dark:border-[#363636] hover:border-[#a78bfa]/50 hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(167,139,250,0.1)] transition-all duration-300 shadow-sm">
            <div className="text-[13px] font-mono text-[#7c3aed] dark:text-[#a78bfa] mb-1.5 font-bold">
              MÀU SẮC (COLOR)
            </div>
            <div className="text-[16px] font-bold text-neutral-900 dark:text-white mb-2">
              Số lượng liên kết
            </div>
            <p className="text-[14px] text-neutral-600 dark:text-[#aaaaaa] leading-relaxed">
              Từ tím nhạt (kết nối đơn lẻ) đến tím đậm rực rỡ khi trào lưu tích lũy quan hệ xuyên
              cộng đồng.
            </p>
          </div>
          <div className="p-6 rounded-2xl bg-white dark:bg-[#262626] border border-neutral-200 dark:border-[#363636] hover:border-[#a78bfa]/50 hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(167,139,250,0.1)] transition-all duration-300 shadow-sm">
            <div className="text-[13px] font-mono text-[#7c3aed] dark:text-[#a78bfa] mb-1.5 font-bold">
              KÍCH THƯỚC (SIZE)
            </div>
            <div className="text-[16px] font-bold text-neutral-900 dark:text-white mb-2">
              Điểm bộc phát (0-100)
            </div>
            <p className="text-[14px] text-neutral-600 dark:text-[#aaaaaa] leading-relaxed">
              Tỷ lệ thuận với Điểm bộc phát (Emergence Score) tổng hợp từ Reach, Velocity, Spread và
              Persistence.
            </p>
          </div>
          <div className="p-6 rounded-2xl bg-white dark:bg-[#262626] border border-neutral-200 dark:border-[#363636] hover:border-[#a78bfa]/50 hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(167,139,250,0.1)] transition-all duration-300 shadow-sm">
            <div className="text-[13px] font-mono text-[#7c3aed] dark:text-[#a78bfa] mb-1.5 font-bold">
              HÌNH DÁNG (SHAPE)
            </div>
            <div className="text-[16px] font-bold text-neutral-900 dark:text-white mb-2">
              Dạng thức nội dung
            </div>
            <p className="text-[14px] text-neutral-600 dark:text-[#aaaaaa] leading-relaxed">
              Tròn (Văn bản), Vuông bo (Hình ảnh), Tam giác (Video), Quả trám (Âm thanh), Ngũ giác
              (Liên kết).
            </p>
          </div>
          <div className="p-6 rounded-2xl bg-white dark:bg-[#262626] border border-neutral-200 dark:border-[#363636] hover:border-[#a78bfa]/50 hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(167,139,250,0.1)] transition-all duration-300 shadow-sm">
            <div className="text-[13px] font-mono text-[#7c3aed] dark:text-[#a78bfa] mb-1.5 font-bold">
              INSPECTOR DRAWER
            </div>
            <div className="text-[16px] font-bold text-neutral-900 dark:text-white mb-2">
              Minh chứng bài gốc
            </div>
            <p className="text-[14px] text-neutral-600 dark:text-[#aaaaaa] leading-relaxed">
              Nhấp vào bất kỳ nốt nào để mở trích dẫn nguồn, số lượt like/share và link mở thẳng bài
              viết trên Bluesky.
            </p>
          </div>
        </div>

        {/* Action Button */}
        <div className="text-center">
          <button
            onClick={onOpenApp}
            className="inline-flex items-center gap-2 px-9 py-4 rounded-full bg-[#a78bfa] hover:bg-[#8b7cf6] text-[#141416] font-bold text-[16px] shadow-xl transition-transform hover:scale-105 active:scale-95"
          >
            <span>Mở Bàn Làm Việc Trend Map Canvas</span>
            <ExternalLink className="size-4" />
          </button>
        </div>
      </section>

      {/* ------------------------------------------------------------ */}
      {/* 9. Compliance & Privacy-First (Lindy Tile 8)                 */}
      {/* ------------------------------------------------------------ */}
      <section
        id="compliance"
        className="py-24 px-4 sm:px-6 bg-neutral-100/70 dark:bg-[#222222] border-y border-neutral-200 dark:border-[#363636]"
      >
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="inline-flex items-center gap-1.5 text-[13px] uppercase font-mono tracking-wider text-[#a78bfa] mb-3 font-semibold">
              <Shield className="size-4" />
              <span>Bảo vệ quyền riêng tư theo thiết kế</span>
            </div>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-neutral-900 dark:text-white tracking-tight mb-5 leading-tight">
              Tuân thủ pháp luật, tôn trọng riêng tư và toàn quyền kiểm soát
            </h2>
            <p className="text-[17px] sm:text-[18px] text-neutral-600 dark:text-[#aaaaaa] leading-relaxed">
              Khác biệt hoàn toàn với các dịch vụ cào dữ liệu lậu (scrape-first) kém bền vững,
              Trendifest được thiết kế với chuẩn mực pháp lý cao nhất tại Việt Nam.
            </p>
          </div>

          {/* 3 Pillar Cards (Lindy Tile 8 style) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Card 1: Compliant */}
            <div className="p-8 rounded-2xl bg-white dark:bg-[#262626] border border-neutral-200 dark:border-[#363636] hover:border-[#a78bfa]/60 hover:-translate-y-1.5 hover:shadow-[0_12px_30px_rgba(167,139,250,0.12)] transition-all duration-300 flex flex-col justify-between group shadow-sm">
              <div>
                <div className="flex items-center gap-2.5 mb-3.5 text-emerald-600 dark:text-emerald-400">
                  <FileCheck2 className="size-5.5 group-hover:scale-110 transition-transform duration-300" />
                  <span className="text-[18px] font-bold text-neutral-900 dark:text-white">
                    Chuẩn mực Pháp lý VN
                  </span>
                </div>
                <p className="text-[15.5px] text-neutral-600 dark:text-[#aaaaaa] leading-relaxed mb-6">
                  Tiên phong tuân thủ chặt chẽ{" "}
                  <strong className="text-neutral-900 dark:text-white">
                    Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15
                  </strong>{" "}
                  và{" "}
                  <strong className="text-neutral-900 dark:text-white">
                    Nghị định 356/2025/NĐ-CP
                  </strong>{" "}
                  (hiệu lực từ 2026).
                </p>
                <div className="p-4.5 rounded-xl bg-neutral-50 dark:bg-[#1e1e1e] border border-neutral-200 dark:border-[#333333] space-y-2.5 text-[14.5px] text-neutral-700 dark:text-[#cccccc]">
                  <div className="flex items-center gap-2.5">
                    <Check className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>Không lập hồ sơ dữ liệu cá nhân</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Check className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>Không suy đoán tuổi, giới tính cụ thể</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Check className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>Chỉ xử lý nội dung công khai hợp lệ</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: Access-First */}
            <div className="p-8 rounded-2xl bg-white dark:bg-[#262626] border border-neutral-200 dark:border-[#363636] hover:border-[#a78bfa]/60 hover:-translate-y-1.5 hover:shadow-[0_12px_30px_rgba(167,139,250,0.12)] transition-all duration-300 flex flex-col justify-between group shadow-sm">
              <div>
                <div className="flex items-center gap-2.5 mb-3.5 text-[#7c3aed] dark:text-[#a78bfa]">
                  <Globe2 className="size-5.5 group-hover:scale-110 transition-transform duration-300" />
                  <span className="text-[18px] font-bold text-neutral-900 dark:text-white">
                    Kết nối Access-First
                  </span>
                </div>
                <p className="text-[15.5px] text-neutral-600 dark:text-[#aaaaaa] leading-relaxed mb-6">
                  Nói không với kỹ thuật cào dữ liệu lậu trái phép. Chỉ sử dụng các cổng API chính
                  thức và luồng WebSocket công khai có quản trị.
                </p>
                <div className="p-4.5 rounded-xl bg-neutral-50 dark:bg-[#1e1e1e] border border-neutral-200 dark:border-[#333333] space-y-2.5 text-[14.5px] text-neutral-700 dark:text-[#cccccc]">
                  <div className="flex items-center gap-2.5">
                    <Check className="size-4 text-[#7c3aed] dark:text-[#a78bfa] shrink-0" />
                    <span>Bluesky Jetstream v2 unauthenticated tail</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Check className="size-4 text-[#7c3aed] dark:text-[#a78bfa] shrink-0" />
                    <span>Meta Threads API & TikTok Research API</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Check className="size-4 text-[#7c3aed] dark:text-[#a78bfa] shrink-0" />
                    <span>Bảo lưu quyền tác giả & permalink</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 3: Deletion Compliance & 100% Local */}
            <div className="p-8 rounded-2xl bg-white dark:bg-[#262626] border border-neutral-200 dark:border-[#363636] hover:border-[#a78bfa]/60 hover:-translate-y-1.5 hover:shadow-[0_12px_30px_rgba(167,139,250,0.12)] transition-all duration-300 flex flex-col justify-between group shadow-sm">
              <div>
                <div className="flex items-center gap-2.5 mb-3.5 text-cyan-600 dark:text-cyan-400">
                  <Lock className="size-5.5 group-hover:scale-110 transition-transform duration-300" />
                  <span className="text-[18px] font-bold text-neutral-900 dark:text-white">
                    Quyền Lãng Quên & Local AI
                  </span>
                </div>
                <p className="text-[15.5px] text-neutral-600 dark:text-[#aaaaaa] leading-relaxed mb-6">
                  Tôn trọng quyền xóa bài viết. Mô hình vector chạy cục bộ trong môi trường nội bộ
                  của tổ chức mà không phát tán ra ngoài.
                </p>
                <div className="p-4.5 rounded-xl bg-neutral-50 dark:bg-[#1e1e1e] border border-neutral-200 dark:border-[#333333] space-y-2.5 text-[14.5px] text-neutral-700 dark:text-[#cccccc]">
                  <div className="flex items-center gap-2.5">
                    <Check className="size-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
                    <span>Tự động xóa vector khi bài gốc bị xóa</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Check className="size-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
                    <span>100% Local Transformers (CPU/GPU riêng)</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Check className="size-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
                    <span>Không huấn luyện mô hình trên dữ liệu người dùng</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ */}
      {/* 10. FAQ Accordion                                           */}
      {/* ------------------------------------------------------------ */}
      <section id="faq" className="py-24 px-4 sm:px-6 max-w-4xl mx-auto">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-1.5 text-[13px] uppercase font-mono tracking-wider text-purple-700 dark:text-[#a78bfa] mb-3 font-semibold">
            <HelpCircle className="size-4" />
            <span>Giải đáp thắc mắc</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-neutral-900 dark:text-white tracking-tight mb-5 leading-tight">
            Câu Hỏi Thường Gặp
          </h2>
          <p className="text-[17px] sm:text-[18px] text-neutral-600 dark:text-[#aaaaaa]">
            Những điều bạn cần biết về nguyên lý hoạt động và cam kết của Trendifest.
          </p>
        </div>

        <div className="divide-y divide-neutral-200 dark:divide-[#363636] border-y border-neutral-200 dark:border-[#363636]">
          {FAQS.map((faq, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div key={idx} className="py-6">
                <button
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                  className="flex items-center justify-between w-full text-left gap-4 text-neutral-900 dark:text-white hover:text-purple-700 dark:hover:text-[#a78bfa] transition-colors py-1"
                >
                  <span className="text-[17px] sm:text-[19px] font-bold leading-snug">
                    {faq.question}
                  </span>
                  <ChevronDown
                    className={cn(
                      "size-5 text-neutral-400 dark:text-[#888888] shrink-0 transition-transform duration-200",
                      isOpen && "rotate-180 text-purple-700 dark:text-[#a78bfa]",
                    )}
                  />
                </button>
                {isOpen && (
                  <p className="mt-4 text-[15.5px] sm:text-[16px] text-neutral-600 dark:text-[#bbbbbb] leading-relaxed pr-8">
                    {faq.answer}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ------------------------------------------------------------ */}
      {/* 13. Grand Final CTA Banner (Lindy Tile 10 Aura Card)         */}
      {/* ------------------------------------------------------------ */}
      <section className="py-24 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto rounded-3xl bg-gradient-to-b from-purple-100 via-purple-50 to-white dark:from-[#2e2642] dark:to-[#1e1e1e] border border-purple-200 dark:border-[#a78bfa]/40 p-10 sm:p-20 text-center relative overflow-hidden shadow-2xl group hover:border-purple-300 dark:hover:border-[#a78bfa]/70 transition-all duration-500">
          <div
            aria-hidden="true"
            className="absolute -top-24 left-1/2 -translate-x-1/2 w-[640px] h-[340px] bg-gradient-to-b from-purple-400/20 via-purple-300/15 to-transparent dark:from-[#c084fc]/25 dark:via-[#a78bfa]/20 dark:to-transparent blur-[130px] pointer-events-none rounded-full animate-pulse"
          />

          <div className="relative z-10">
            <h2 className="text-4xl sm:text-6xl font-extrabold text-neutral-900 dark:text-white tracking-tight mb-6 leading-tight">
              Sẵn sàng đón đầu đỉnh sóng văn hóa số cùng Trendifest?
            </h2>
            <p className="max-w-2xl mx-auto text-[18px] sm:text-[21px] text-neutral-600 dark:text-[#cccccc] leading-relaxed mb-10">
              Đừng để thương hiệu của bạn là người cuối cùng biết đến trào lưu. Bắt đầu quan sát các
              tín hiệu bộc phát đầu tiên ngay hôm nay.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-7">
              <button
                onClick={onOpenApp}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 text-[16px] font-bold bg-[#a78bfa] hover:bg-[#8b7cf6] text-[#141416] px-9 py-4 rounded-full shadow-2xl transition-all hover:scale-105 active:scale-95 whitespace-nowrap shrink-0"
              >
                <span>Khám Phá Đồ Thị Live Ngay</span>
                <ArrowRight className="size-4.5 shrink-0" />
              </button>
              <button
                onClick={() => setDemoModalOpen(true)}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 text-[16px] font-medium text-neutral-800 dark:text-white bg-white dark:bg-[#262626] hover:bg-neutral-100 dark:hover:bg-[#333333] border border-neutral-300 dark:border-[#363636] px-8 py-4 rounded-full transition-colors whitespace-nowrap shrink-0 shadow-sm"
              >
                <span>Liên Hệ Đặt Lịch Demo Doanh Nghiệp</span>
              </button>
            </div>

            <p className="text-[14px] text-neutral-500 dark:text-[#888888]">
              Không cần thẻ tín dụng • Truy cập tức thì • Đăng ký tài khoản trong 2 phút
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ */}
      {/* 14. Footer (Lindy Tile 11)                                   */}
      {/* ------------------------------------------------------------ */}
      <footer className="border-t border-neutral-200 dark:border-[#363636] bg-neutral-100 dark:bg-[#181818] py-16 px-4 sm:px-6 text-[14.5px] text-neutral-600 dark:text-[#888888]">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-5 gap-10 mb-12">
          {/* Brand Info */}
          <div className="md:col-span-2 space-y-4">
            <div className="flex items-center gap-2.5 text-[18px] font-bold text-neutral-900 dark:text-white">
              <span className="flex size-8 items-center justify-center rounded-lg bg-purple-100 dark:bg-[#a78bfa]/20 border border-purple-200 dark:border-[#a78bfa]/40 text-purple-700 dark:text-[#a78bfa]">
                <Network className="size-4.5" />
              </span>
              <span>Trendifest</span>
            </div>
            <p className="text-[14.5px] text-neutral-600 dark:text-[#999999] leading-relaxed max-w-sm">
              Hệ thống trinh sát và dự báo sớm xu hướng số, văn hóa mạng và biến động thảo luận cho
              Gen Z tại Việt Nam. Thuộc lĩnh vực Khoa học Dữ liệu và Mạng xã hội.
            </p>
            <div className="text-[13.5px] text-neutral-500 dark:text-[#777777] space-y-1">
              <div>Kiến trúc: Local Vector Inference • Privacy-First</div>
              <div>Tiêu chuẩn: Tuân thủ Luật An toàn thông tin & BV Dữ liệu cá nhân</div>
            </div>
          </div>

          {/* Column 1: Sản phẩm */}
          <div>
            <div className="text-[14px] font-mono uppercase tracking-wider text-neutral-900 dark:text-white mb-3.5 font-bold">
              Sản phẩm
            </div>
            <ul className="space-y-2.5 text-[14.5px]">
              <li>
                <button
                  onClick={onOpenApp}
                  className="hover:text-purple-700 dark:hover:text-white transition-colors"
                >
                  Trend Map Canvas
                </button>
              </li>
              <li>
                <a
                  href="#how-it-works"
                  className="hover:text-purple-700 dark:hover:text-white transition-colors"
                >
                  Quy trình trinh sát
                </a>
              </li>
              <li>
                <a
                  href="#tech"
                  className="hover:text-purple-700 dark:hover:text-white transition-colors"
                >
                  Mô hình Hawkes Process
                </a>
              </li>
              <li>
                <a
                  href="#faq"
                  className="hover:text-purple-700 dark:hover:text-white transition-colors"
                >
                  Câu hỏi thường gặp (FAQ)
                </a>
              </li>
            </ul>
          </div>

          {/* Column 2: Pháp lý & Đạo đức */}
          <div>
            <div className="text-[14px] font-mono uppercase tracking-wider text-neutral-900 dark:text-white mb-3.5 font-bold">
              Pháp lý & Đạo đức
            </div>
            <ul className="space-y-2.5 text-[14.5px]">
              <li>
                <a
                  href="#compliance"
                  className="hover:text-purple-700 dark:hover:text-white transition-colors"
                >
                  Luật BV Dữ liệu cá nhân 91/2025
                </a>
              </li>
              <li>
                <a
                  href="#compliance"
                  className="hover:text-purple-700 dark:hover:text-white transition-colors"
                >
                  Chính sách Access-First
                </a>
              </li>
              <li>
                <a
                  href="#compliance"
                  className="hover:text-purple-700 dark:hover:text-white transition-colors"
                >
                  Quyền lãng quên (Deletion)
                </a>
              </li>
              <li>
                <a
                  href="#compliance"
                  className="hover:text-purple-700 dark:hover:text-white transition-colors"
                >
                  Nguyên tắc AI Độc lập
                </a>
              </li>
            </ul>
          </div>

          {/* Column 3: Liên hệ */}
          <div>
            <div className="text-[14px] font-mono uppercase tracking-wider text-neutral-900 dark:text-white mb-3.5 font-bold">
              Liên hệ
            </div>
            <ul className="space-y-2.5 text-[14.5px]">
              <li>
                <a
                  href="mailto:hanhnguyen17122006@gmail.com"
                  className="hover:text-purple-700 dark:hover:text-white transition-colors"
                >
                  hanhnguyen17122006@gmail.com
                </a>
              </li>
              <li>
                <span className="text-neutral-900 dark:text-white font-medium">Hotline:</span> 0935
                009 725
              </li>
              <li>
                <span>Đà Nẵng, Việt Nam</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Footer Bottom Bar */}
        <div className="max-w-6xl mx-auto pt-8 border-t border-neutral-200 dark:border-[#2a2a2a] flex flex-col sm:flex-row items-center justify-between gap-4 text-[13.5px] text-neutral-500 dark:text-[#777777]">
          <div>Copyright © 2026 Trendifest. All rights reserved.</div>
          <div className="flex items-center gap-4">
            <span className="text-purple-700 dark:text-[#a78bfa] font-semibold">
              ✦ Real-time Social Signal Intelligence
            </span>
            <span>•</span>
            <span>Độc lập • Minh bạch • Bảo mật</span>
          </div>
        </div>
      </footer>

      {/* ------------------------------------------------------------ */}
      {/* 15. Demo Booking Modal Dialog                                */}
      {/* ------------------------------------------------------------ */}
      {demoModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/80 backdrop-blur-sm"
        >
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#262626] border border-neutral-200 dark:border-[#363636] p-7 sm:p-9 shadow-2xl relative text-left">
            <button
              onClick={() => {
                setDemoModalOpen(false);
                setDemoSubmitted(false);
              }}
              className="absolute top-4 right-4 text-neutral-400 dark:text-[#888888] hover:text-neutral-900 dark:hover:text-white p-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/5"
            >
              <X className="size-5" />
            </button>

            {!demoSubmitted ? (
              <>
                <div className="flex items-center gap-2 mb-2 text-purple-700 dark:text-[#a78bfa]">
                  <Compass className="size-5" />
                  <span className="text-[13px] font-mono uppercase tracking-wider font-semibold">
                    Đặt lịch Demo Giải pháp
                  </span>
                </div>
                <h3 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2.5">
                  Trải nghiệm Trendifest cho Doanh nghiệp
                </h3>
                <p className="text-[15px] text-neutral-600 dark:text-[#aaaaaa] mb-6 leading-relaxed">
                  Để lại thông tin để đội ngũ Trendifest thiết lập phiên làm việc thử nghiệm và cung
                  cấp quyền truy cập hệ thống.
                </p>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setDemoSubmitted(true);
                  }}
                  className="space-y-4.5"
                >
                  <div>
                    <label className="block text-[14px] font-medium text-neutral-700 dark:text-[#cccccc] mb-1.5">
                      Họ và tên *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Nguyễn Văn A"
                      className="w-full px-4 py-2.5 rounded-lg bg-neutral-50 dark:bg-[#1e1e1e] border border-neutral-200 dark:border-[#363636] text-neutral-900 dark:text-white text-[15px] focus:outline-none focus:border-purple-600 dark:focus:border-[#a78bfa]"
                    />
                  </div>
                  <div>
                    <label className="block text-[14px] font-medium text-neutral-700 dark:text-[#cccccc] mb-1.5">
                      Email công việc *
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="a.nguyen@company.vn"
                      className="w-full px-4 py-2.5 rounded-lg bg-neutral-50 dark:bg-[#1e1e1e] border border-neutral-200 dark:border-[#363636] text-neutral-900 dark:text-white text-[15px] focus:outline-none focus:border-purple-600 dark:focus:border-[#a78bfa]"
                    />
                  </div>
                  <div>
                    <label className="block text-[14px] font-medium text-neutral-700 dark:text-[#cccccc] mb-1.5">
                      Tên tổ chức / Thương hiệu
                    </label>
                    <input
                      type="text"
                      placeholder="Agency / Brand Name"
                      className="w-full px-4 py-2.5 rounded-lg bg-neutral-50 dark:bg-[#1e1e1e] border border-neutral-200 dark:border-[#363636] text-neutral-900 dark:text-white text-[15px] focus:outline-none focus:border-purple-600 dark:focus:border-[#a78bfa]"
                    />
                  </div>
                  <div>
                    <label className="block text-[14px] font-medium text-neutral-700 dark:text-[#cccccc] mb-1.5">
                      Mục tiêu quan tâm nhất
                    </label>
                    <select className="w-full px-4 py-2.5 rounded-lg bg-neutral-50 dark:bg-[#1e1e1e] border border-neutral-200 dark:border-[#363636] text-neutral-900 dark:text-white text-[15px] focus:outline-none focus:border-purple-600 dark:focus:border-[#a78bfa]">
                      <option>Đón đầu xu hướng cho chiến dịch marketing</option>
                      <option>Theo dõi và phòng ngừa rủi ro thảo luận số</option>
                      <option>Bắt trend soundtrack/CapCut làm nội dung TikTok</option>
                      <option>Nghiên cứu thị trường & dữ liệu học thuật</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    className="w-full mt-3 py-3.5 rounded-lg bg-[#a78bfa] hover:bg-[#8b7cf6] text-[#141416] font-bold text-[15.5px] transition-colors shadow-lg"
                  >
                    Gửi Yêu Cầu Đặt Lịch
                  </button>
                </form>
              </>
            ) : (
              <div className="text-center py-8">
                <div className="size-14 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="size-8" />
                </div>
                <h3 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">
                  Đã nhận thông tin thành công!
                </h3>
                <p className="text-[15px] text-neutral-600 dark:text-[#aaaaaa] mb-6">
                  Đội ngũ Trendifest sẽ liên hệ với bạn trong vòng 24 giờ làm việc để thống nhất
                  lịch demo.
                </p>
                <button
                  onClick={() => {
                    setDemoModalOpen(false);
                    setDemoSubmitted(false);
                  }}
                  className="px-6 py-2.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 dark:bg-[#333333] dark:hover:bg-[#404040] text-neutral-900 dark:text-white text-[14.5px] font-medium"
                >
                  Đóng cửa sổ
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------ */}
      {/* 16. Video Walkthrough Modal Dialog                           */}
      {/* ------------------------------------------------------------ */}
      {videoModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 dark:bg-black/85 backdrop-blur-md"
        >
          <div className="w-full max-w-3xl rounded-2xl bg-white dark:bg-[#262626] border border-neutral-200 dark:border-[#363636] p-7 shadow-2xl relative text-left">
            <button
              onClick={() => setVideoModalOpen(false)}
              className="absolute top-4 right-4 text-neutral-400 dark:text-[#888888] hover:text-neutral-900 dark:hover:text-white p-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/5"
            >
              <X className="size-5" />
            </button>

            <div className="flex items-center gap-2 mb-3 text-purple-700 dark:text-[#a78bfa]">
              <PlayCircle className="size-5.5" />
              <span className="text-[13px] font-mono uppercase tracking-wider font-semibold">
                Video Giới thiệu 2 Phút
              </span>
            </div>
            <h3 className="text-2xl font-bold text-neutral-900 dark:text-white mb-4">
              Cách Trendifest Hoạt Động Trên Thực Tế
            </h3>

            {/* Video Player Simulation with Step-by-Step Flow */}
            <div className="aspect-video w-full rounded-xl bg-neutral-900 dark:bg-[#1a1a1a] border border-neutral-800 dark:border-[#333333] flex flex-col justify-between p-6 sm:p-8 relative overflow-hidden">
              <div className="flex items-center justify-between text-[12.5px] font-mono text-neutral-400 dark:text-[#888888]">
                <span>MÔ PHỎNG LUỒNG TRINH SÁT (SIMULATION DEMO)</span>
                <span className="text-emerald-400 font-semibold">● 1080p HD</span>
              </div>

              <div className="space-y-4 my-auto">
                <div className="p-5 rounded-2xl bg-neutral-800/90 dark:bg-[#262626] border border-purple-400/40 dark:border-[#a78bfa]/40 shadow-lg max-w-lg mx-auto">
                  <div className="flex items-center gap-2 text-[14px] text-emerald-400 font-bold mb-1.5">
                    <Activity className="size-4 animate-spin" />
                    <span>Thuật toán Hawkes: Phát hiện gia tốc tự kích hoạt</span>
                  </div>
                  <p className="text-[15px] text-white leading-relaxed">
                    Mẫu video CapCut kết hợp âm thanh remix vượt biên từ phân đoạn{" "}
                    <span className="text-purple-300 dark:text-[#a78bfa] font-semibold">
                      Shitposting
                    </span>{" "}
                    sang{" "}
                    <span className="text-blue-300 dark:text-[#60a5fa] font-semibold">
                      Music Discovery
                    </span>
                    .
                  </p>
                  <div className="mt-2.5 text-[12.5px] font-mono text-neutral-400 dark:text-[#aaaaaa]">
                    Dự báo xác suất bùng nổ: 74% trong 12 giờ tới (Độ tin cậy: 0.86)
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-neutral-800 dark:border-[#2a2a2a]">
                <button
                  onClick={() => {
                    setVideoModalOpen(false);
                    onOpenApp();
                  }}
                  className="inline-flex items-center gap-2 text-[14.5px] font-bold text-purple-300 dark:text-[#a78bfa] hover:text-white"
                >
                  <span>Mở ứng dụng để tự thao tác trực tiếp</span>
                  <ArrowRight className="size-4" />
                </button>
                <span className="text-[12.5px] font-mono text-neutral-400 dark:text-[#777777]">
                  Thời lượng: 02:14
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
