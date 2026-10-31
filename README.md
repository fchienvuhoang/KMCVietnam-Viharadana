# KMCVietnam-Vihāradāna

Bản độc lập dành cho nhóm thiện pháp KMCVietnam-Vihāradāna.

Ứng dụng Next.js phân loại nội dung chuyển khoản từ file sao kê MB PDF theo danh sách thiện pháp và bộ từ khóa đã quản lý trước.

## Stack

- Next.js App Router, TypeScript, Tailwind CSS
- PostgreSQL qua Prisma ORM
- Import PDF MB bằng `pdfjs-dist`
- Deploy phù hợp với Vercel

## Cấu trúc sao kê MB đã hỗ trợ

Dùng PDF gốc có lớp văn bản do MB xuất, mẫu **Sổ phụ chi tiết kiêm báo nợ/báo có**.

- Thông tin tài khoản: số tài khoản, tên tài khoản, loại tiền VND, kỳ sao kê.
- Giao dịch: ngày giao dịch, số bút toán, phát sinh nợ, phát sinh có, nội dung.
- Hỗ trợ nhiều trang và nội dung xuống dòng; đối chiếu tổng phát sinh trước khi nhập.
- Chống trùng bằng số tài khoản MB và số bút toán.
- Mẫu này không có số dư đầu/cuối kỳ; hiển thị **Chưa có số dư** nếu chưa có số dư đã biết.

## Database đề xuất trên Vercel

Dùng PostgreSQL managed trên Vercel Marketplace. Các lựa chọn phù hợp:

- Neon: Postgres serverless phổ biến cho Next.js/Vercel.
- Prisma Postgres: phù hợp nếu muốn đi theo hệ sinh thái Prisma.
- Supabase: Postgres có dashboard và auth/storage nếu sau này cần mở rộng.

Sau khi provision database trên Vercel, dùng URL qua pooler cho traffic ứng dụng. Ứng dụng ưu tiên
`DATABASE_POOL_URL`, sau đó `POSTGRES_PRISMA_URL`, `POSTGRES_URL`, và cuối cùng mới tới
`DATABASE_URL`. Không dùng URL direct/non-pooling làm `DATABASE_POOL_URL` trên Vercel.

Nếu nhà cung cấp cấp riêng hai URL, cấu hình:

```bash
DATABASE_POOL_URL="postgresql://...pooler-host.../database?sslmode=require"
DATABASE_URL="postgresql://...direct-host.../database?sslmode=require"
```

Áp dụng biến cho cả Production, Preview và Development rồi redeploy. Nên chọn database region
gần Vercel Functions để tránh timeout do độ trễ mạng.

Ứng dụng dùng một Prisma client và một PostgreSQL pool dùng chung trong mỗi instance. Pool được
đăng ký với Vercel Fluid Compute để đóng kết nối idle đúng cách khi function bị suspend, đồng thời
giới hạn mặc định ở 2 kết nối để tránh vượt `max connections` trên serverless. Có thể cấu hình lại khi cần:

```bash
DATABASE_POOL_MAX="2"
```

## Schema chính

- `BankAccount`: thông tin tài khoản ngân hàng, số dư hiện tại theo kỳ import mới nhất.
- `ImportBatch`: mỗi lần import file sao kê, lưu số dòng mới/trùng/chưa phân loại.
- `Campaign`: thiện pháp, mã như `cntt10`, `kathina-pm`.
- `CampaignKeyword`: danh sách từ khóa của từng thiện pháp, đã chuẩn hóa không dấu để match linh hoạt.
- `BankTransaction`: giao dịch sao kê, unique theo `detail` gồm ngân hàng MB, số tài khoản và số bút toán.
- Khoản chi được lấy trực tiếp từ cột `NO` trong `BankTransaction` và gắn vào thiện pháp tương ứng.

## Chạy local

```bash
cp .env.example .env
```

Cập nhật `DATABASE_URL` trong `.env`, sau đó:

```bash
pnpm db:generate
pnpm db:deploy
pnpm dev
```

Mở `http://localhost:3000`.

## Đăng nhập quản trị

Trang quản trị `/` và các API quản trị được bảo vệ bằng mật khẩu trong biến môi trường:

```bash
ADMIN_PASSWORD="mật-khẩu-mạnh"
```

Tạo mật khẩu mạnh:

```bash
openssl rand -base64 32
```

Khi deploy Vercel, thêm `ADMIN_PASSWORD` vào Project Settings → Environment Variables. Các trang public `/thien-phap/[ma-thien-phap]` vẫn mở công khai cho thí chủ xem.

## Báo cáo chỉ xem

Trang `/bao-cao` hiển thị số dư tài khoản, danh sách thiện pháp, tổng thu và link công khai. Trang này không có chức năng thêm, sửa, xóa hoặc import và không cấp quyền gọi API quản trị.

Cấu hình mật khẩu cố định bằng biến môi trường, không lưu database:

```bash
READONLY_VIEW_PASSWORD="mật-khẩu-tối-thiểu-8-ký-tự"
```

Link gửi cho người xem là `/bao-cao`. Trang được đặt `noindex`, `nofollow`, `noarchive`, không gửi referrer và không được cache.

## Deploy Vercel

1. Push project lên GitHub.
2. Import project vào Vercel.
3. Tạo PostgreSQL từ Vercel Marketplace hoặc kết nối resource có sẵn.
4. Đảm bảo `DATABASE_URL` và `ADMIN_PASSWORD` được inject vào project.
5. Vercel chạy `npm run vercel-build` theo `vercel.json`: áp dụng migration bằng
   `prisma migrate deploy` trước khi build ứng dụng. Nếu migration thất bại, build sẽ dừng.
   `DATABASE_URL` phải trỏ tới cùng database mà URL pool của ứng dụng sử dụng.
6. Mở trang quản trị để tạo thiện pháp của nhóm. Database mới khởi tạo trống; không cần seed.

Nếu bản đang chạy báo `The table public.CampaignBill does not exist`, chạy migration
với `DATABASE_URL` của đúng môi trường bị lỗi rồi redeploy:

```bash
pnpm db:deploy
```

Migration `20261012090000_add_campaign_bills` tạo bảng lưu ảnh bill, index và khóa
ngoại tới thiện pháp. Không cần reset database.

## Luồng sử dụng

1. Tạo thiện pháp và nhập từ khóa liên quan.
2. Upload file sao kê MB `.pdf`.
3. Hệ thống parse các dòng giao dịch, bỏ qua mã bút toán MB của tài khoản đã tồn tại.
4. Giao dịch được phân loại theo keyword đang active.
5. Giao dịch chưa khớp có thể gán thủ công. Bổ sung keyword để tự động phân loại các giao dịch import mới.
6. Gán các dòng cột `NO` vào thiện pháp tương ứng để theo dõi tổng chi và tồn quỹ.
7. Gửi link public `/thien-phap/[ma-thien-phap]` cho thí chủ xem thu chi theo từng thiện pháp.

## Cấu hình bản riêng KMCVietnam-Vihāradāna

- Tạo project Vercel mới từ repo `fchienvuhoang/KMCVietnam-Viharadana`.
- Tạo database PostgreSQL riêng; không dùng URL database của nhóm cũ. Nếu dùng pool, cả URL pool và direct phải trỏ cùng database mới.
- Đặt `ADMIN_PASSWORD` và `READONLY_VIEW_PASSWORD` mới, độc lập với nhóm cũ.
- `NEXT_PUBLIC_APP_URL` có thể để trống để link chia sẻ tự dùng domain hiện tại; nếu đặt thì dùng URL production của project mới.
- Build command: `npm run vercel-build`. Migration chạy trước build.
- Bản này không kèm sao kê tĩnh và các thiện pháp seed của nhóm cũ. Logo chữ KMC là dấu hiệu tạm, có thể thay tại `public/assets/kmc-vietnam-mark.svg`.

## Sao kê MB PDF

Runtime yêu cầu Node.js 22.13 trở lên (cấu hình Node.js 22.x hoặc 24.x trên Vercel).

Nhóm KMCVietnam-Vihāradāna dùng sao kê MB. Chọn **Import sao kê** và tải PDF gốc có lớp văn bản, mẫu **Sổ phụ chi tiết kiêm báo nợ/báo có** (tối đa 4 MB). Chỉ nhận mẫu MB PDF này.

- Đọc số tài khoản, tên tài khoản, kỳ sao kê, mã bút toán, phát sinh nợ/có và nội dung nhiều dòng trên nhiều trang.
- Chống trùng theo ngân hàng MB + số tài khoản + mã bút toán, kể cả khi nhập lại hoặc kỳ sao kê chồng nhau.
- Đối chiếu tổng nợ/có với tổng phát sinh trong PDF trước khi ghi database; file không khớp sẽ bị từ chối.
- Mẫu MB này không có số dư đầu/cuối kỳ. Không suy ra số dư từ chênh lệch thu chi; giữ số dư đã biết hoặc hiển thị **Chưa có số dư**.
- Không hỗ trợ PDF scan hoặc mẫu bố cục khác; cần kiểm tra và bổ sung parser cho mẫu mới.
- Kiểm tra parser: `node --experimental-strip-types --test tests/mbbank.test.mjs`.
