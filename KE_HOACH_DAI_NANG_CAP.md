# KẾ HOẠCH ĐẠI NÂNG CẤP TOÀN DIỆN HỆ THỐNG AGAR.IO SIMULATION
## (Comprehensive Grand Upgrade Blueprint & Architecture Specification)

---

### MỤC LỤC
1. **TỔNG QUAN DỰ ÁN & TRIẾT LÝ ĐẠI NÂNG CẤP**
   - 1.1. Bối cảnh & Hiện trạng hệ sinh thái mô phỏng
   - 1.2. Mục tiêu chiến lược của đợt Đại Nâng Cấp
   - 1.3. Triết lý thiết kế trò chơi: Cân bằng vật lý, Hiệu năng 60 FPS & Trải nghiệm giác quan

2. **KIẾN TRÚC MÃ NGUỒN & PHÂN TÍCH MODULE HIỆN TẠI**
   - 2.1. Lớp Vật lý & Mô phỏng (`engine.ts`, `config.ts`)
   - 2.2. Lớp Trí tuệ Nhân tạo Đa tính cách (`ai.ts`)
   - 2.3. Lớp Kết xuất Đồ họa Canvas 2D (`renderer.ts`)
   - 2.4. Lớp Âm thanh Thủ tục Web Audio API (`sound.ts`)
   - 2.5. Lớp Lưu trữ Trạng thái Cục bộ & Tiến trình (`storage.ts`)
   - 2.6. Lớp Giao diện Người dùng React 19 & Tương tác (`App.tsx`, `index.css`)

3. **CHI TIẾT ĐẠI NÂNG CẤP: CHẾ ĐỘ CHƠI MỚI (GAME MODES)**
   - 3.1. Chế độ Sinh Tồn Vòng Bo (Battle Royale - `royale`)
     - Thuật toán vòng bo năng lượng co dần (Shrinking Safe Zone)
     - Sát thương bức xạ ngoài vòng bo (Out-of-zone Radiation Decay)
     - Cơ chế tính toán người sống sót cuối cùng & Đăng quang Victory Royale
   - 3.2. Chế độ Siêu Tốc Độ (Turbo Surge - `turbo`)
     - Cải biến động học: Tăng 35% vận tốc cơ bản, tăng 20% xung lực phân bào
     - Tăng tốc chu kỳ hợp nhất tế bào (Merge Cooldown -40%)
     - Mật độ hạt dinh dưỡng cao cấp xuất hiện liên tục

4. **CHI TIẾT ĐẠI NÂNG CẤP: HỆ THỐNG HẠT NĂNG LƯỢNG ĐẶC BIỆT (SPECIAL POWER PELLETS)**
   - 4.1. Hạt Hoàng Kim (Gold Super Pellet)
   - 4.2. Hạt Xung Lực Tốc Biến (Speed Boost Pellet)
   - 4.3. Hiệu ứng vệt sáng (Motion Light Trail) & Hạt phân rã hạt nhân

5. **CHI TIẾT ĐẠI NÂNG CẤP: HỆ THỐNG SKIN HUYỀN THOẠI & HIỆU ỨNG RENDER ĐỒ HỌA**
   - 5.1. Bổ sung 5 Diện Mạo Huyền Thoại (Legendary Skins)
     - Long Thần (Dragon): Vảy rồng lam ngọc, mắt đỏ lửa thần
     - Phượng Hoàng (Phoenix): Vầng hào quang lửa đỏ cam thiêng liêng
     - Hố Đen Vũ Trụ (Portal / Void): Xoáy hấp dẫn hút các hạt ánh sáng
     - Lưới Điện Cyberpunk (Cyber): Phong cách ma trận mạch điện neon tím hồng
     - Hoa Anh Đào (Sakura): Tế bào cánh hoa đào thuần khiết thanh nhã
   - 5.2. Nâng cấp bộ đổ bóng viền tế bào (Cell Membrane Dynamic Outline)

6. **CHI TIẾT ĐẠI NÂNG CẤP: BẢNG TIN CHIẾN ĐẤU (KILL FEED) & COMBO MULTI-KILL**
   - 6.1. Bảng tin chiến sự thời gian thực (Live Kill Feed & Announcer)
   - 6.2. Hệ thống đếm chuỗi hạ gục (Streak & Multi-kill Combos: Double, Triple, Mega Kill)
   - 6.3. Thông báo ngôi vương (Apex Predator / Top 1 King Announcement)

7. **CHI TIẾT ĐẠI NÂNG CẤP: TIẾN TRÌNH NGƯỜI CHƠI, CẤP ĐỘ (LEVEL), EXP & DANH HIỆU**
   - 7.1. Công thức tính điểm kinh nghiệm (EXP Formula)
   - 7.2. Thang bảng 50 Cấp độ (Levels 1 - 50) và 5 Bậc Danh Hiệu (Tân Binh -> Thần Thoại)
   - 7.3. Mở rộng Hệ thống Thành Tựu (Achievements Expansion) từ 10 lên 16 thành tựu độc bản

8. **CHI TIẾT ĐẠI NÂNG CẤP: ÂM THANH THỦ TỤC THẾ HỆ MỚI (PROCEDURAL AUDIO V2)**
   - 8.1. Âm thanh Còi báo động Vòng bo Sinh tồn (`royale_alarm`)
   - 8.2. Âm thanh Nhặt Hạt Siêu Năng Lượng (`powerup`)
   - 8.3. Âm thanh Chuỗi hạ gục thăng hoa (`combo`)
   - 8.4. Âm thanh Phân bào thần tốc (`whoosh`)

9. **CHI TIẾT ĐẠI NÂNG CẤP: TỐI ƯU GIAO DIỆN DI ĐỘNG & ĐIỀU KHIỂN CẢM ỨNG (MOBILE HUD)**
   - 9.1. Nút bấm cảm ứng công thái học đa điểm (Ergonomic Touch Buttons)
   - 9.2. Phản hồi xúc giác rung nhẹ (Tactile Haptic Feedback)
   - 9.3. Cải tiến độ nhạy của Joystick ảo điều hướng

10. **KẾ HOẠCH TRIỂN KHAI, KIỂM THỬ AN TOÀN VẬT LÝ & CAM KẾT CHẤT LƯỢNG**
    - 10.1. Bảo toàn 100% tính bất biến toán học (Zero Invariant Violations)
    - 10.2. Bảo đảm tương thích toàn bộ 9 bộ test suites hiện hữu
    - 10.3. Kiểm thử hiệu năng, độ trễ và giải phóng bộ nhớ

---

### 1. TỔNG QUAN DỰ ÁN & TRIẾT LÝ ĐẠI NÂNG CẤP

#### 1.1. Bối cảnh & Hiện trạng hệ sinh thái mô phỏng
Dự án là một bản mô phỏng tinh vi, chuẩn xác và mượt mà của thể loại game tế bào Agar.io, được viết hoàn toàn trên nền tảng Web hiện đại (React 19, TypeScript, Canvas 2D API, Web Audio API, Tailwind CSS). Trò chơi hiện có một lõi động cơ vật lý chuẩn mực (`AgarEngine`), 48 bot trí tuệ nhân tạo với 9 tính cách hành vi riêng biệt (Thợ săn, Cơ hội, Nhút nhát, Thu thập, Du mục, Phục kích, Sống sót, Khổng lồ, Phân tách), hệ thống virus phân mảnh tế bào, và 3 chế độ cơ bản (FFA, Teams, Experimental).

Tuy nhiên, để trở thành một sản phẩm giải trí đỉnh cao mang lại cảm giác phấn khích kéo dài hàng giờ cho người chơi, trò chơi cần một bước nhảy vọt:
- Đa dạng hóa chế độ chơi mang tính kịch tính cao (như Sinh tồn Battle Royale và Siêu tốc độ).
- Bổ sung các yếu tố chiến thuật bất ngờ trên bản đồ (Hạt năng lượng hoàng kim, Hạt tăng tốc tức thời).
- Phản hồi thị giác và thính giác phong phú hơn (Bảng tin chiến đấu trực tiếp, âm thanh vinh quang khi lập chuỗi combo).
- Cơ chế gắn kết lâu dài: Cấp độ tài khoản, điểm kinh nghiệm EXP, mở khóa danh hiệu và bảng thành tích vinh quang.
- Trải nghiệm di động vượt trội với cụm phím điều khiển cảm ứng trực quan, nhạy bén.

#### 1.2. Mục tiêu chiến lược của đợt Đại Nâng Cấp
1. **Gia tăng tính đa dạng & đột biến (Gameplay Variety)**: Đưa vào 2 chế độ chơi hoàn toàn mới (`royale` và `turbo`), cùng các loại hạt năng lượng đặc biệt xuất hiện ngẫu nhiên.
2. **Kích thích dopamine & cảm xúc người chơi (Juiciness & Game Feel)**: Kill feed trực quan, hiệu ứng rung lắc nhẹ khi ăn tế bào lớn, chuỗi hạ gục Combo Multi-Kill kèm âm thanh tổng hợp đa âm sắc.
3. **Chiều sâu tiến trình (Progression Depth)**: Hệ thống EXP và 50 Cấp độ giúp mỗi ván chơi đều có ý nghĩa tích lũy lâu dài.
4. **Tuyệt đối không phá vỡ tính ổn định (Zero Invariant Regression)**: Toàn bộ công thức vật lý, bán kính khối lượng, kiểm tra tràn số, kiểm tra ngoài biên đều phải tuân thủ nghiêm ngặt chuẩn mực hiện hữu.

---

### 2. KIẾN TRÚC MÃ NGUỒN & PHÂN TÍCH MODULE

Hệ thống được tổ chức theo kiến trúc phân tách ranh giới rõ ràng:
- **`src/agar/config.ts`**: Nơi duy nhất định nghĩa các hằng số cân bằng game (`BALANCE`) và trọng số AI (`AI_PERSONALITY`).
- **`src/agar/types.ts`**: Chứa toàn bộ định nghĩa kiểu dữ liệu thuần túy (Organism, Cell, Food, Virus, ArenaSnapshot, v.v.).
- **`src/agar/engine.ts`**: Động cơ mô phỏng thời gian thực, quản lý vòng lặp bước cố định (`fixedStep = 1/60s`), thuật toán va chạm không gian (Spatial Hashing Grid), phân bào, phóng khối lượng, virus và cơ chế mẹ tế bào.
- **`src/agar/renderer.ts`**: Bộ dựng hình HTML5 Canvas siêu tối ưu, quản lý camera nội suy mượt mà (`cameraSmoothing`), hiệu ứng hạt phân rã, vẽ da tế bào (skins), minimap và chữ chiến đấu nổi (`floaters`).
- **`src/agar/sound.ts`**: Bộ tổng hợp âm thanh thủ tục sử dụng Web Audio API không cần tải file MP3 ngoài, tạo âm thanh bằng các bộ dao động (OscillatorNode, GainNode, BiquadFilterNode).
- **`src/agar/storage.ts`**: Quản lý lưu trữ trạng thái người chơi an toàn trong `localStorage`, chống lỗi parse JSON, kiểm tra tính hợp lệ của biệt danh và ghi nhận thành tựu.
- **`src/App.tsx`**: Trình điều khiển giao diện người dùng chính, kết nối giữa Canvas, vòng lặp hoạt họa `requestAnimationFrame` và các cửa sổ chức năng.

---

### 3. CHI TIẾT ĐẠI NÂNG CẤP: CHẾ ĐỘ CHƠI MỚI (GAME MODES)

#### 3.1. Chế độ Sinh Tồn Vòng Bo (Battle Royale - `royale`)
- **Khái niệm**: 49 sinh thể (1 người chơi + 48 bot) xuất phát trong đấu trường 4800x4800. Sau 15 giây đầu bình yên, một Vòng Bo Năng Lượng (Energy Safe Zone) bắt đầu thu nhỏ dần tâm về giữa đấu trường.
- **Quy luật thu hẹp**: Bán kính an toàn ban đầu là `R_max = 2400px`. Mỗi giây, bán kính giảm đều với tốc độ có tính toán, kèm cảnh báo âm thanh mỗi khi đợt sóng bức xạ co lại.
- **Sát thương ngoài bo**: Bất kỳ tế bào nào nằm ngoài bán kính an toàn sẽ phải chịu bức xạ phân rã khối lượng (`decay_rate = 3.5%/giây`). Khối lượng phân rã biến thành các hạt bụi ánh sáng rơi trên chiến trường.
- **Chiến thắng tối hậu (Victory Royale)**: Khi tất cả đối thủ bị nuốt chửng hoặc phân rã hết, người chơi còn sống sót cuối cùng sẽ nhận danh hiệu Quán Quân Sinh Tồn kèm thưởng lớn EXP.

#### 3.2. Chế độ Siêu Tốc Độ (Turbo Surge - `turbo`)
- **Khái niệm**: Dành cho những game thủ yêu thích nhịp độ chóng mặt, phản xạ chớp nhoáng.
- **Gia tốc động học**:
  - Tốc độ di chuyển cơ bản của mọi tế bào tăng 35% (`baseSpeed * 1.35`).
  - Xung lực phân bào (Split Impulse) tăng 20% giúp các pha phóng tế bào lao vút đi như mũi tên săn mồi.
  - Thời gian chờ hợp nhất (`mergeDelay`) giảm 40%, giúp tế bào nhanh chóng tái hợp để phòng thủ hoặc nuốt con mồi tiếp theo.
  - Hạt thức ăn hồi sinh với tốc độ gấp đôi, mang đến sự thịnh vượng khối lượng bùng nổ.

---

### 4. HỆ THỐNG HẠT NĂNG LƯỢNG ĐẶC BIỆT (SPECIAL POWER PELLETS)

Bên cạnh 2900 hạt thức ăn thông thường, đấu trường sẽ xuất hiện ngẫu nhiên hai loại hạt năng lượng cao cấp:
1. **Hạt Hoàng Kim (Gold Super Pellet)**:
   - Màu sắc: Vàng óng kim ánh hào quang chuyển động liên tục.
   - Giá trị: Cung cấp ngay +25 đơn vị khối lượng (gấp 15 lần hạt thường).
   - Hiệu ứng: Khi nuốt, phát ra luồng hạt lấp lánh và hiện chữ nổi màu vàng `+25 KHỐI LƯỢNG`.
2. **Hạt Xung Lực Tốc Biến (Speed Boost Pellet)**:
   - Màu sắc: Xanh ngọc lam neon phát sáng rực rỡ.
   - Tác dụng: Kích hoạt trạng thái Tăng Tốc Xung Lực (Speed Surge) trong 3.5 giây, tăng thêm 30% tốc độ lướt cho tế bào.
   - Hiệu ứng thị giác: Tế bào phát ra vệt hào quang kéo dài phía sau khi bơi.

---

### 5. HỆ THỐNG SKIN HUYỀN THOẠI & HIỆU ỨNG RENDER ĐỒ HỌA

Bổ sung 5 diện mạo huyền thoại độc nhất vô nhị:
1. **Long Thần (Dragon)**: Tông xanh ngọc uy nghi, vảy rồng sắc nét cùng ấn ký mắt rồng rực sáng thần thái.
2. **Phượng Hoàng Lửa (Phoenix)**: Lửa thiêng chuyển màu từ đỏ rực, cam vàng đến ánh sáng mặt trời, viền lông vũ phượng hoàng bất tử.
3. **Hố Đen Vũ Trụ (Portal / Void)**: Tâm hố đen huyền bí với các vòng xoáy không thời gian và hạt ánh sáng bị hút vào trung tâm.
4. **Lưới Điện Cyberpunk (Cyber)**: Phong cách tương lai vi mạch điện tử neon tím hồng, các đường mạch dữ liệu phát quang chạy dọc thân tế bào.
5. **Hoa Anh Đào (Sakura)**: Họa tiết 5 cánh hoa anh đào nở rộ trên nền hồng phấn thanh tao, các chấm nhụy hoa tinh tế đậm chất nghệ thuật phương Đông.

---

### 6. BẢNG TIN CHIẾN ĐẤU (KILL FEED) & COMBO MULTI-KILL

- **Live Kill Feed**: Hiển thị kín đáo, thanh lịch ở góc trên màn hình:
  - `"Bạn đã nuốt chửng [Bot] (+120 điểm)"`
  - `"[Apex Bot] đã nuốt chửng [Mini Bot]"`
- **Chuỗi hạ gục (Kill Streaks)**:
  - Nếu nuốt liên tiếp 2 tế bào đối thủ trong vòng 5 giây: **DOUBLE KILL!**
  - Nuốt 3 tế bào liên tiếp: **TRIPLE KILL!**
  - Nuốt 4 tế bào trở lên: **MEGA KILL! THỐNG TRỊ ĐẤU TRƯỜNG!**
- Đi kèm âm thanh vinh quang đa tầng và chữ nổi phong cách chiến trận rực rỡ.

---

### 7. HỆ THỐNG CẤP ĐỘ (LEVEL), EXP & DANH HIỆU BẬC THẦY

1. **Công thức tính EXP**:
   $$\text{EXP} = \text{Điểm đỉnh} \times 0.2 + \text{Số hạt ăn} \times 0.5 + \text{Số tế bào nuốt} \times 15 + \text{Thời gian sống (giây)} \times 1$$
2. **Cấp bậc danh hiệu**:
   - Cấp 1 - 5: **Tân Binh Đấu Trường (Novice Blob)**
   - Cấp 6 - 15: **Thợ Săn Tế Bào (Cell Hunter)**
   - Cấp 16 - 30: **Thực Thể Khổng Lồ (Apex Behemoth)**
   - Cấp 31 - 45: **Chúa Tể Sinh Vật (Bio Overlord)**
   - Cấp 46 - 50: **Thực Thể Vũ Trụ Tối Cao (Cosmic Singularity)**
3. **Mở rộng kho 16 Thành Tựu**:
   - Thêm các thành tựu mới: "Chiến thần Sinh tồn" (Thắng mode Royale), "Siêu tốc độ" (Đạt 1500 điểm ở mode Turbo), "Bậc thầy Combo" (Đạt Triple Kill), "Bất khả xâm phạm" (Sống sót qua 3 lần nổ virus), v.v.

---

### 8. HỆ THỐNG TỔNG HỢP ÂM THANH THỦ TỤC V2 (PROCEDURAL AUDIO V2)

Bổ sung các hàm tổng hợp sóng âm Web Audio:
- **`royale_alarm`**: Sóng hình cưa tần số thấp lặp lại 3 nhịp dồn dập cảnh báo bão bức xạ đang ập tới.
- **`powerup`**: Hợp âm arpeggio thăng tiến ngọt ngào từ nốt Đô (C5) đến nốt Sol (G5) tạo cảm giác thu nhận sức mạnh kỳ diệu.
- **`combo`**: Tiếng chuông cộng hưởng dày dặn với bộ lọc tần số cao mở dần.
- **`whoosh`**: Tiếng xé gió rít nhẹ khi phân bào với tốc độ cao.

---

### 9. TỐI ƯU GIAO DIỆN DI ĐỘNG & ĐIỀU KHIỂN CẢM ỨNG (MOBILE HUD)

- Thiết kế lại hoàn toàn thanh điều khiển cảm ứng `touch-actions`:
  - Nút **TÁCH (SPLIT)** tròn lớn, đặt ở vị trí ngón cái thuận tiện.
  - Nút **BẮN (EJECT)** có hỗ trợ nhấn giữ liên tục để xả khối lượng mượt mà.
  - Phản hồi xúc giác rung nhẹ (`navigator.vibrate(20)`) khi tách hoặc nuốt tế bào.
  - Joystick ảo mềm mại với đường tròn giới hạn biên không gây che khuất tầm nhìn.

---

### 10. KẾ HOẠCH TRIỂN KHAI & ĐẢM BẢO CHẤT LƯỢNG

1. **Bước 1**: Mở rộng hệ thống kiểu dữ liệu (`types.ts`) với đầy đủ các enum và interface mới.
2. **Bước 2**: Nâng cấp module âm thanh thủ tục (`sound.ts`) với các hiệu ứng âm thanh mới.
3. **Bước 3**: Cập nhật module lưu trữ (`storage.ts`) với cơ chế tính EXP, Level và 16 thành tựu.
4. **Bước 4**: Nâng cấp động cơ vật lý (`engine.ts`) với chế độ Royale, chế độ Turbo, hạt đặc biệt và hệ thống Kill Feed.
5. **Bước 5**: Nâng cấp bộ dựng đồ họa (`renderer.ts`) với vòng bo năng lượng, hạt đặc biệt và 5 skin huyền thoại mới.
6. **Bước 6**: Tích hợp toàn diện trên giao diện người dùng (`App.tsx` & `index.css`) với thanh trạng thái EXP, Level, Kill Feed, Mobile HUD và bộ chọn chế độ.
7. **Bước 7**: Chạy kiểm thử (`vitest`) và biên dịch (`compile_applet`) để đảm bảo không có bất kỳ lỗi nào phát sinh.

*Bản kế hoạch này được thiết lập làm kim chỉ nam thực thi cho toàn bộ quá trình đại nâng cấp.*
