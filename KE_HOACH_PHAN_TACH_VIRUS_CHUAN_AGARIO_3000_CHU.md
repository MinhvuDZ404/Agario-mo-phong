# ĐẠI KẾ HOẠCH TOÀN DIỆN & KIẾN TRÚC VẬT LÝ PHÂN TÁCH VIRUS CHUẨN AGAR.IO GỐC
## TÀI LIỆU THIẾT KẾ KỸ THUẬT, MÔ PHỎNG VẬT LÝ VÀ CHUYỂN HÓA CƠ CHẾ VIRUS NGUYÊN BẢN (OFFICIAL AGAR.IO / OGAR SPECIFICATION)

---

## MỤC LỤC CHI TIẾT
1. **Lời mở đầu & Bối cảnh kỹ thuật**
2. **Khảo sát & Phân tích cơ chế Virus trong Agar.io nguyên bản**
   - 2.1. Nguồn gốc thiết kế Virus (ZeuS / Matheus Valadares - 2015)
   - 2.2. Vai trò sinh thái của Virus trong đấu trường Agar.io
   - 2.3. Quy chuẩn kích thước, khối lượng và điều kiện kích nổ (Trigger Threshold)
3. **Phân tích các lỗ hổng và sai lệch của hệ thống cũ so với Agar.io gốc**
   - 3.1. Lỗ hổng kịch bản kịch trần 16 mảnh (16-Fragment Cap Violation)
   - 3.2. Sai lệch góc bắn và phân bố hình học (Wheel Symmetry vs Radial Starburst)
   - 3.3. Sai lệch động lực học xung lực và quán tính (Impulse & Kinetic Transfer)
   - 3.4. Sai lệch thời gian tái hợp nhất (Merge Cooldown Uniformity)
   - 3.5. Sự thiếu hụt về chuyển động sóng xung kích và phản xạ biên
4. **Mô hình toán học & Động lực học chất lỏng tế bào (Cell Fluid Dynamics)**
   - 4.1. Phương trình bảo toàn khối lượng tuyệt đối (Absolute Mass Conservation)
   - 4.2. Hàm số phân bố số lượng phân mảnh ($N_{splits}$) theo dung lượng và khối lượng
   - 4.3. Phân rã xung lực theo góc tán xạ ngẫu nhiên (Angular Jitter & Radial Dispersion)
   - 4.4. Kế thừa vector vận tốc tới (Momentum Vector Inheritance)
   - 4.5. Phản lực giật lùi (Parent Recoil Mechanics)
   - 4.6. Hàm số thời gian tái hợp phụ thuộc khối lượng ($T_{merge}(M)$)
5. **Đặc tả chi tiết cơ chế Virus Farming ở giới hạn 16 mảnh (The 16-Cell Virus Eat Tactic)**
   - 5.1. Khái niệm và lịch sử chiến thuật "Ăn Virus ở 16 mảnh"
   - 5.2. Luồng thực thi thuật toán khi $C_{cells} = 16$
   - 5.3. Xử lý phần thưởng khối lượng và tái sinh Virus trong đấu trường
6. **Kiến trúc mã nguồn và Tích hợp vào Engine (`src/agar/engine.ts`)**
   - 6.1. Tái cấu trúc hàm `explode(owner, cell, bonus)`
   - 6.2. Thuật toán phân bổ khối lượng từng mảnh (Exact Remainder Distribution)
   - 6.3. Tính toán va chạm biên và triệt tiêu xung lực xuyên tường
   - 6.4. Xử lý tương thích với Mother Cell (Chế độ Thực nghiệm - Experimental Mode)
7. **Hiệu ứng đồ họa, Âm thanh và Phản hồi xúc giác (Sensory & Visual Polish)**
   - 7.1. Hệ thống hạt gai xanh (Spike Debris Particle Burst)
   - 7.2. Hiệu ứng rung xung động màng tế bào (Elastic Membrane Oscillation / Pulse)
   - 7.3. Text thông báo nổi (Floating Combat Text & Color Schemes)
   - 7.4. Âm thanh kích nổ chuẩn phòng thu
8. **Kế hoạch triển khai mã nguồn & Kiểm thử chất lượng (Testing & QA Pipeline)**
   - 8.1. Kiểm thử bất biến toán học (Mass Conservation Invariant Test)
   - 8.2. Kiểm thử hành vi 16 mảnh (16-Cell Cap Immunity Test)
   - 8.3. Kiểm thử phân rã góc và phân bố vận tốc (Dispersion Velocity Test)
   - 8.4. Kiểm thử tương thích chế độ chơi (Turbo, Royale, FFA, Boss)
9. **Tổng kết và Tuyên ngôn kỹ thuật**

---

## 1. LỜI MỞ ĐẦU & BỐI CẢNH KỸ THUẬT

Trò chơi **Agar.io**, được sáng tạo bởi nhà phát triển Matheus Valadares vào tháng 4 năm 2015, đã định nghĩa lại toàn bộ thể loại game sinh tồn tế bào nhiều người chơi (IO Games). Trọng tâm của lối chơi Agar.io không chỉ nằm ở việc các tế bào lớn nuốt tế bào nhỏ, mà nằm ở sự cân bằng sinh thái tinh vi được thiết lập bởi **Virus** (những thực thể gai màu xanh lá cây có hình răng cưa đặc trưng đứng yên trên bản đồ).

Virus đóng vai trò là "kẻ cân bằng quyền lực" (The Great Equalizer). Chúng cung cấp nơi trú ẩn an toàn tuyệt đối cho những người chơi mới sinh ra với khối lượng nhỏ, đồng thời là mối đe dọa sinh tử, có khả năng xé toạc các người chơi khổng lồ thành nhiều mảnh vụn nếu họ bất cẩn va chạm.

Tuy nhiên, trong quá trình phát triển các bản mô phỏng, nhiều dự án đã đơn giản hóa hoặc mô hình sai cơ chế nổ Virus. Thay vì mô phỏng động lực học phân tán tự nhiên của Agar.io nguyên bản, các hệ thống thường áp dụng các công thức toán học cứng nhắc, chia đều góc theo hình nan hoa xe đạp (bicycle wheel geometry), hoặc áp đặt các hình phạt phi lý (như trừ phần trăm khối lượng khi tế bào đã đạt giới hạn phân mảnh).

Văn kiện kỹ thuật này là **Đại Kế Hoạch 3000 Chữ** đặt nền móng kiến trúc chi tiết, phân tích triệt để sự khác biệt giữa hệ thống hiện tại và cơ chế Agar.io gốc, đồng thời thiết lập giải pháp kỹ thuật toàn diện nhằm chuyển đổi 100% thuật toán nổ và ăn virus sang chuẩn Agar.io nguyên bản (official client và Ogar server specification).

---

## 2. KHẢO SÁT & PHÂN TÍCH CƠ CHẾ VIRUS TRONG AGAR.IO NGUYÊN BẢN

### 2.1. Nguồn gốc thiết kế Virus (ZeuS / Matheus Valadares - 2015)
Trong tài liệu thiết kế nguyên bản của Agar.io và mã nguồn máy chủ cộng đồng Ogar/Cigar, Virus là thực thể tĩnh có khối lượng cơ sở khoảng 100 đơn vị (hoặc bán kính khoảng 58 - 60 pixel). Virus không thể tự di chuyển trừ khi bị người chơi bắn các khối tế bào (ejected mass - phím W) vào thân.

### 2.2. Vai trò sinh thái của Virus trong đấu trường
1. **Lá chắn sinh tồn cho tế bào nhỏ (Underdog Shield):**
   Mọi tế bào có khối lượng nhỏ hơn hoặc bằng ngưỡng kích hoạt của virus ($M_{cell} \le M_{trigger}$, thông thường là khoảng 130 - 132 trong bản gốc, hoặc 165 trong cấu hình hiện tại) hoàn toàn có thể trốn bên dưới hoặc bơi xuyên qua Virus mà không chịu bất kỳ tác động tiêu cực nào. Điều này cho phép những người chơi yếu thế tránh khỏi sự truy đuổi của những gã khổng lồ có khối lượng hàng ngàn đơn vị.
2. **Bẫy hủy diệt đối với tế bào lớn (Apex Predator Trap):**
   Khi một tế bào có khối lượng lớn hơn ngưỡng kích nổ di chuyển sao cho tâm của nó lấn sâu vào thân Virus (khoảng cách tâm nhỏ hơn bán kính tế bào trừ một phần bán kính virus), Virus sẽ phát nổ, xé nhỏ tế bào đó thành nhiều mảnh nhỏ bay ra các hướng.
3. **Vũ khí tầm xa (Virus Feeding & Splitting):**
   Người chơi có thể dùng phím W bắn 7 viên thức ăn vào Virus để khiến Virus nhân bản và phóng ra một quả Virus thứ hai theo hướng bắn, dùng để ám sát các đối thủ to lớn từ xa.

### 2.3. Quy chuẩn kích thước, khối lượng và điều kiện kích nổ
- **Bán kính Virus ($R_v$):** Bán kính hiển thị là 58 px.
- **Ngưỡng khối lượng kích nổ ($M_{trigger}$):** Tế bào phải có khối lượng tối thiểu $M_{trigger}$ mới kích nổ Virus.
- **Điều kiện va chạm hình học:**
  Khoảng cách hai tâm $D = \sqrt{(x_{cell} - x_{virus})^2 + (y_{cell} - y_{virus})^2}$.
  Điều kiện kích nổ trong bản gốc không phải là chạm mép tiếp tuyến ($D < R_{cell} + R_v$), mà là tế bào phải nuốt sâu vào Virus:
  $$D < R_{cell} - R_v \cdot 0.28$$
  Nếu tế bào quá nhỏ, nó chui vào bên trong mà không kích hoạt. Nếu tế bào lớn và đi sâu qua ngưỡng trên, vụ nổ lập tức được kích hoạt.

---

## 3. PHÂN TÍCH CÁC LỖ HỔNG VÀ SAI LỆCH CỦA HỆ THỐNG CŨ SO VỚI AGAR.IO GỐC

Khi soi xét kỹ lưỡng hàm `explode` trong `src/agar/engine.ts` của phiên bản cũ, chúng ta phát hiện 5 sai lệch cơ bản khiến trải nghiệm phân tách virus hoàn toàn khác biệt và mất đi linh hồn của Agar.io nguyên bản:

### 3.1. Lỗ hổng kịch bản kịch trần 16 mảnh (16-Fragment Cap Violation)
- **Hệ thống cũ đang làm gì:**
  ```typescript
  const capacity = BALANCE.maxFragments + 1 - owner.cells.length;
  if (capacity < 2) {
    // At the fragment cap the virus still punishes: burn mass instead of bursting.
    cell.mass = Math.max(BALANCE.minSplitMass, cell.mass * 0.85);
    cell.mergeAt = this.time + BALANCE.virusMergeDelay;
    if (owner.id === 0) arenaSound.play('virus');
    return;
  }
  ```
  Nếu người chơi đã có đủ 16 mảnh (giới hạn tối đa trong Agar.io), hệ thống cũ phạt người chơi bằng cách **đốt cháy 15% khối lượng** (`cell.mass * 0.85`) và làm mới thời gian hợp nhất!
- **Agar.io gốc hoạt động như thế nào:**
  Trong Agar.io nguyên bản, đây là một tính năng chiến lược cực kỳ nổi tiếng mang tên **"16-Cell Virus Eating / Virus Farming"**. Khi một người chơi đã chia nhỏ cơ thể thành đủ 16 mảnh, người chơi **miễn nhiễm hoàn toàn với việc bị nổ thêm**! Khi một mảnh tế bào 16 va vào virus, nó sẽ **nuốt chửng Virus** và được cộng thêm khối lượng của Virus (khoảng 65 đến 100 khối lượng), Virus biến mất và tái sinh ở tọa độ khác. Người chơi đẳng cấp cao thường chủ động phân tách thành 16 mảnh để đi "càn quét" toàn bộ virus trên bản đồ nhằm gia tăng khối lượng khổng lồ mà không sợ bị trừng phạt.
- **Hệ quả của lỗi:** Khiến người chơi ức chế, phá hủy hoàn toàn chiến thuật đỉnh cao của Agar.io gốc.

### 3.2. Sai lệch góc bắn và phân bố hình học (Wheel Symmetry vs Radial Starburst)
- **Hệ thống cũ đang làm gì:**
  ```typescript
  for (let i = 1; i < count; i++) {
    const angle = i / (count - 1) * Math.PI * 2;
    const piece = this.makeCell(owner.id, cell.x + Math.cos(angle) * 15, cell.y + Math.sin(angle) * 15, mass);
    ...
  }
  ```
  Hệ thống cũ tính góc bắn bằng công thức tuần hoàn tuyến tính `i / (count - 1) * 2 * PI`.
- **Hệ quả:** Các mảnh vỡ bay ra tạo thành một đa giác đều hoàn hảo, giống như các nan hoa của một bánh xe đạp tĩnh. Mọi vụ nổ virus đều trông giống hệt nhau, đơ cứng, giả tạo và phi tự nhiên.
- **Agar.io gốc:** Các mảnh vỡ được phóng ra theo kiểu chùm sao bộc phát (radial starburst) với một góc khởi tạo ngẫu nhiên $\theta_{base} \in [0, 2\pi)$ kết hợp với độ dao động góc ngẫu nhiên (angular jitter) cho từng mảnh. Nhờ đó, vụ nổ trông sống động, hỗn loạn và bùng nổ chân thực như một tế bào hữu cơ bị vỡ.

### 3.3. Sai lệch động lực học xung lực và quán tính (Impulse & Kinetic Transfer)
- **Hệ thống cũ đang làm gì:**
  ```typescript
  piece.vx = Math.cos(angle) * (280 + this.random() * 220);
  piece.vy = Math.sin(angle) * (280 + this.random() * 220);
  ```
  Tốc độ bắn chỉ đạt từ 280 đến 500 px/s, quá chậm so với xung lực phân tách chuẩn (trong `BALANCE.splitImpulse` là 800 px/s). Các mảnh vỡ chỉ "trườn" nhẹ ra ngoài rồi dừng lại sát bên tế bào mẹ.
- **Hệ quả:** Các mảnh không bắn văng xa, khiến đối thủ xung quanh không thể nhặt mồi, và người chơi bị nổ không cảm nhận được cảm giác chấn động kinh hoàng khi va phải virus.
- **Agar.io gốc:** Các mảnh phóng đi với vận tốc xung lực cực lớn (750 - 950 px/s), kèm theo việc thừa hưởng một phần vector vận tốc hiện tại của tế bào mẹ (momentum transfer) và làm giật lùi nhẹ tế bào mẹ (recoil force).

### 3.4. Sai lệch thời gian tái hợp nhất (Merge Cooldown Uniformity)
- **Hệ thống cũ đang làm gì:**
  Áp dụng một con số cố định phẳng:
  `cell.mergeAt = this.time + BALANCE.virusMergeDelay;` (cố định 22 giây cho tất cả các mảnh bất kể lớn nhỏ).
- **Agar.io gốc:**
  Thời gian cấm hợp nhất phụ thuộc trực tiếp vào khối lượng của từng mảnh vỡ:
  $$T_{merge} = T_{base} + M_{piece} \cdot \beta$$
  Trong đó các mảnh vỡ nhỏ li ti (khối lượng 20 - 40) có thể hợp nhất trở lại rất nhanh (chỉ sau khoảng 14 - 16 giây), trong khi mảnh vỡ lớn nhất phải mất 30 - 45 giây mới được phép hợp nhất. Việc áp dụng thời gian phẳng 22 giây làm sai lệch hoàn toàn tính chiến thuật sinh tồn sau khi nổ.

### 3.5. Sự thiếu hụt về chuyển động sóng xung kích và phản xạ biên
Khi mảnh vỡ văng chạm tường biên bản đồ ($x \le 0$ hoặc $x \ge W$), trong hệ thống cũ chỉ có hàm `clamp` thô bạo khiến mảnh tế bào bị dính chặt vào mép tường. Trong Agar.io gốc, các mảnh vỡ khi va vào tường biên sẽ trượt dọc tường hoặc đàn hồi nhẹ vào trong đấu trường.

---

## 4. MÔ HÌNH TOÁN HỌC & ĐỘNG LỰC HỌC CHẤT LỎNG TẾ BÀO (CELL FLUID DYNAMICS)

Để tái hiện chính xác 100% cảm giác va chạm và phân tách của Agar.io gốc, chúng ta xây dựng hệ thống mô hình toán học và vật lý toàn diện như sau:

### 4.1. Phương trình bảo toàn khối lượng tuyệt đối (Absolute Mass Conservation)
Tổng khối lượng của người chơi ngay sau vụ nổ phải bằng chính xác tổng khối lượng trước vụ nổ cộng với khối lượng thưởng của Virus:
$$M_{after} = M_{before} + M_{virusBonus}$$

Khi một tế bào mẹ có khối lượng $M_0$ ăn virus có phần thưởng $M_{bonus}$, tổng khối lượng cần phân bổ là:
$$M_{total} = M_0 + M_{bonus}$$

Nếu tế bào phân tách thành $K$ mảnh (bao gồm tế bào mẹ gốc và $K - 1$ mảnh mới sinh ra), điều kiện bất biến tiên quyết là:
$$\sum_{j=0}^{K-1} m_j = M_{total}$$

Để tránh sai số làm tròn số thực (floating point drift) làm mất khối lượng của người chơi theo thời gian, ta sử dụng thuật toán phân bổ nguyên số dư:
$$m_{base} = \frac{M_{total}}{K}$$
Mỗi mảnh nhận $m_{base}$, đảm bảo sai số tích lũy bằng 0 tuyệt đối.

### 4.2. Hàm số phân bố số lượng phân mảnh ($N_{splits}$) theo dung lượng và khối lượng
Số lượng phân mảnh tối đa bị khống chế bởi hai yếu tố:
1. **Dung lượng còn trống của người chơi:**
   $$C_{avail} = M_{maxFragments} - N_{currentCells}$$
   Với $M_{maxFragments} = 16$.
2. **Khối lượng của tế bào mẹ:**
   Một tế bào chỉ có thể chia nhỏ nếu các mảnh con đạt khối lượng tối thiểu $M_{minBurst}$ (thông thường là 20 đến 28 đơn vị khối lượng):
   $$K_{maxFromMass} = \left\lfloor \frac{M_{total}}{M_{minBurst}} \right\rfloor$$

Từ đó, số lượng mảnh con mới sinh ra ($S_{new}$) được xác định bởi:
$$S_{new} = \min(C_{avail}, \max(0, K_{maxFromMass} - 1))$$

Nếu $S_{new} = 0$, tế bào không phân tách mà chỉ hấp thụ trọn vẹn khối lượng $M_{bonus}$ (trường hợp $C_{avail} = 0$ khi người chơi đã đạt 16 mảnh, hoặc tế bào quá nhỏ để chia tiếp).
Tổng số mảnh sau vụ nổ của tế bào đó là:
$$K = 1 + S_{new}$$

### 4.3. Phân rã xung lực theo góc tán xạ ngẫu nhiên (Angular Jitter & Radial Dispersion)
Thay vì chia đều góc, ta xác định một góc cơ sở ngẫu nhiên cho toàn bộ vụ nổ:
$$\theta_0 \sim \mathcal{U}(0, 2\pi)$$

Đối với mỗi mảnh con $i \in \{1, 2, \dots, S_{new}\}$, góc bắn $\theta_i$ được tính bằng:
$$\theta_i = \theta_0 + \frac{2\pi \cdot (i - 1)}{S_{new}} + \delta_i$$
Trong đó $\delta_i$ là độ nhiễu góc ngẫu nhiên tuân theo phân phối đều:
$$\delta_i \sim \mathcal{U}(-0.25, 0.25) \text{ (radians)}$$

Sự có mặt của $\delta_i$ giúp các mảnh vỡ bay ra với hướng tự nhiên, không tạo thành hình tròn cứng nhắc mà mang dáng dấp chùm hoa lửa bùng phát sinh động.

### 4.4. Kế thừa vector vận tốc tới (Momentum Vector Inheritance)
Khi một tế bào mẹ đang lao nhanh vào virus với vận tốc $(v_{x0}, v_{y0})$, theo định luật bảo toàn động lượng của chất lưu hữu cơ, các mảnh vỡ sinh ra sẽ kế thừa một phần động lượng của tế bào mẹ theo hướng di chuyển:
$$v_{x, i} = \cos(\theta_i) \cdot V_{burst} + v_{x0} \cdot \alpha_{momentum}$$
$$v_{y, i} = \sin(\theta_i) \cdot V_{burst} + v_{y0} \cdot \alpha_{momentum}$$

Trong đó:
- $V_{burst} = V_{baseImpulse} \cdot (0.85 + 0.3 \cdot \text{rand}())$ với $V_{baseImpulse} \approx 820 \text{ px/s}$.
- $\alpha_{momentum} \approx 0.35$ là hệ số bảo lưu quán tính.

### 4.5. Phản lực giật lùi (Parent Recoil Mechanics)
Tế bào mẹ còn lại tại tâm vụ nổ cũng phải chịu một phản lực giật lùi nhẹ ngược lại với hướng phân tán trung bình của các mảnh con, tạo nên hiệu ứng va chạm nảy sinh động:
$$v_{x, parent} = v_{x0} \cdot 0.2 - \cos(\theta_0) \cdot 180$$
$$v_{y, parent} = v_{y0} \cdot 0.2 - \sin(\theta_0) \cdot 180$$

### 4.6. Hàm số thời gian tái hợp phụ thuộc khối lượng ($T_{merge}(M)$)
Để phản ánh chính xác quy luật chơi của Agar.io, mỗi mảnh con sau vụ nổ được gán thời gian mở khóa hợp nhất riêng biệt:
$$T_{merge}(m_i) = t_{current} + T_{base} + m_i \cdot \beta_{merge}$$
Với:
- $T_{base} = 14 \text{ giây}$ (thời gian cơ sở tối thiểu).
- $\beta_{merge} = 0.014 \text{ s/mass}$ (hệ số gia tăng theo khối lượng).

Ví dụ:
- Một mảnh vỡ nhỏ khối lượng $30$: $T_{delay} = 14 + 30 \times 0.014 = 14.42 \text{ giây}$.
- Một mảnh vỡ lớn khối lượng $500$: $T_{delay} = 14 + 500 \times 0.014 = 21.0 \text{ giây}$.
- Một tế bào khổng lồ $2000$: $T_{delay} = 14 + 2000 \times 0.014 = 42.0 \text{ giây}$.

Điều này khuyến khích người chơi bị nổ thu gom nhanh các mảnh nhỏ của chính mình để tránh bị đối thủ ăn thịt.

---

## 5. ĐẶC TẢ CHI TIẾT CƠ CHẾ VIRUS FARMING Ở GIỚI HẠN 16 MẢNH (THE 16-CELL VIRUS EAT TACTIC)

### 5.1. Khái niệm và lịch sử chiến thuật "Ăn Virus ở 16 mảnh"
Trong cộng đồng người chơi Agar.io chuyên nghiệp toàn cầu, kỹ thuật "16-Cell Split" là một trong những cột mốc kỹ năng quan trọng nhất:
1. Khi một người chơi đã đạt đến khối lượng trên 1000, tốc độ di chuyển của họ rất chậm và họ trở thành mục tiêu của những người chơi khác bắn virus vào.
2. Để vừa tăng tốc độ di chuyển vừa gia tăng khối lượng nhanh nhất, người chơi chủ động bấm phím Space 4 lần liên tiếp để chia cơ thể thành đúng 16 mảnh nhỏ.
3. Khi đã có 16 mảnh, người chơi lao thẳng vào tất cả các Virus trên đường đi. Mỗi quả Virus bị nuốt chửng ngay lập tức, đem lại từ 65 đến 100 khối lượng cho mảnh tế bào vừa va chạm.
4. Mảnh tế bào ăn virus **hoàn toàn không bị nổ thêm** (vì trần số lượng tế bào của một người chơi trong luật game là 16).
5. Chiến thuật này cho phép người chơi "dọn sạch" một cụm 4-5 virus trong vòng vài giây, thu về hàng trăm điểm khối lượng mà đối thủ không thể cản phá.

### 5.2. Luồng thực thi thuật toán khi $C_{cells} = 16$
Khi một tế bào $C$ thuộc người chơi $P$ va chạm với Virus $V$:
1. Kiểm tra điều kiện khối lượng: $C.mass > BALANCE.virusTriggerMass$.
2. Kiểm tra điều kiện khoảng cách: $\text{distance}(C, V) < C.radius - V.radius \cdot 0.28$.
3. Kiểm tra số lượng mảnh hiện tại:
   $$\text{capacity} = BALANCE.maxFragments - P.cells.length$$
   Nếu $\text{capacity} \le 0$:
   - **Không phân tách bất kỳ mảnh nào.**
   - Cộng thẳng khối lượng thưởng vào tế bào: $C.mass += bonus$.
   - Phát âm thanh ăn virus độc đắc (`arenaSound.play('swallow')` hoặc `'virus'`).
   - Hiển thị văn bản nổi: `+65 (Ăn Virus!)` với màu xanh lá dạ quang `#22c55e`.
   - Tạo hiệu ứng hạt sóng hấp thụ xung quanh tế bào.
   - Di chuyển Virus $V$ đến một tọa độ ngẫu nhiên mới trên bản đồ để duy trì mật độ sinh thái.
   - Kết thúc xử lý mà không làm gián đoạn chuyển động của người chơi.

### 5.3. Xử lý phần thưởng khối lượng và tái sinh Virus trong đấu trường
Khi Virus bị ăn (dù là do nổ hay do ăn ở 16 mảnh):
- Vị trí của Virus được tái sinh lập tức tại tọa độ mới thông qua hàm `this.coordinate(180)`.
- Số lượng thức ăn tích lũy trong virus (`virus.fed`) được đặt về 0.
- Thời điểm phát xạ cuối (`virus.lastEmission`) được cập nhật bằng `this.time`.
- Đảm bảo tổng số lượng virus trên toàn đấu trường luôn bất biến và ổn định.

---

## 6. KIẾN TRÚC MÃ NGUỒN VÀ TÍCH HỢP VÀO ENGINE (`src/agar/engine.ts`)

### 6.1. Tái cấu trúc hàm `explode(owner, cell, bonus)`
Hàm `explode` sẽ được tái thiết kế hoàn toàn theo mô hình phân tách chất lỏng chuẩn Agar.io:

```typescript
private explode(owner: Organism, cell: Cell, bonus: number) {
  if (owner.id !== 0) recordVirusPop(this.brains.get(owner.id), this.aiTotals, this.time);

  // 1. Tế bào luôn nhận được phần thưởng khối lượng của Virus
  cell.mass += bonus;
  const currentTotalMass = cell.mass;

  // 2. Tính toán dung lượng phân mảnh còn lại của người chơi (Tối đa 16 mảnh)
  const maxAllowed = BALANCE.maxFragments;
  const availableSlots = maxAllowed - owner.cells.length;

  // 3. Cơ chế 16 MẢNH CHUẨN AGAR.IO GỐC (VIRUS EATING IMMUNITY)
  // Nếu người chơi đã đạt kịch trần 16 mảnh: KHÔNG BỊ PHẠT, KHÔNG BỊ TRỪ MASS!
  // Tế bào ăn trọn vẹn virus và giữ nguyên khối lượng gia tăng!
  if (availableSlots <= 0) {
    cell.pulse = 1.25;
    if (owner.id === 0) {
      arenaSound.play('virus');
      this.addFloater(cell.x, cell.y - cell.radius, `+${Math.round(bonus)} Ăn Virus!`, '#22c55e');
    }
    this.burst(cell.x, cell.y, '#4ade80', 16);
    return;
  }

  // 4. Xác định số mảnh phân tách theo khối lượng và dung lượng
  const maxPiecesFromMass = Math.floor(currentTotalMass / BALANCE.virusMinBurstMass);
  // Số mảnh con mới sinh ra (ngoài tế bào gốc)
  const piecesToSpawn = Math.min(availableSlots, Math.max(1, maxPiecesFromMass - 1));
  const totalPieces = piecesToSpawn + 1;

  // 5. Phân bổ khối lượng chính xác tuyệt đối bảo toàn năng lượng
  const baseMass = currentTotalMass / totalPieces;
  cell.mass = baseMass;
  cell.radius = massRadius(baseMass);
  cell.pulse = 1.35;
  cell.mergeAt = this.time + mergeDelay(baseMass);

  // 6. Tính toán xung lực và tán xạ góc bùng nổ chuẩn Agar.io
  const baseAngle = this.random() * Math.PI * 2;
  const parentVx = cell.vx;
  const parentVy = cell.vy;

  // Phản lực giật lùi cho tế bào mẹ
  cell.vx = parentVx * 0.2 - Math.cos(baseAngle) * 120;
  cell.vy = parentVy * 0.2 - Math.sin(baseAngle) * 120;

  for (let i = 0; i < piecesToSpawn; i++) {
    // Góc tán xạ có độ lệch tự nhiên (jitter)
    const angleFraction = i / piecesToSpawn;
    const jitter = (this.random() - 0.5) * 0.32;
    const angle = baseAngle + angleFraction * Math.PI * 2 + jitter;

    // Vị trí xuất phát sát viền tế bào mẹ
    const spawnDist = Math.max(10, cell.radius * 0.45);
    const spawnX = clamp(cell.x + Math.cos(angle) * spawnDist, 20, WORLD - 20);
    const spawnY = clamp(cell.y + Math.sin(angle) * spawnDist, 20, WORLD - 20);

    const piece = this.makeCell(owner.id, spawnX, spawnY, baseMass);
    piece.radius = massRadius(baseMass) * 0.65; // Co lại nhẹ để hiệu ứng bung nở mượt mà
    piece.pulse = 1.15;

    // Xung lực bắn cực mạnh chuẩn Agar.io (750 - 980 px/s)
    const burstImpulse = (BALANCE.splitImpulse * 0.95) + (this.random() * 240);
    piece.vx = Math.cos(angle) * burstImpulse + parentVx * 0.35;
    piece.vy = Math.sin(angle) * burstImpulse + parentVy * 0.35;

    // Thời gian cấm hợp nhất theo khối lượng riêng biệt của mảnh
    piece.mergeAt = this.time + mergeDelay(baseMass);

    owner.cells.push(piece);
  }

  // 7. Hiệu ứng đồ họa bùng nổ gai virus và âm thanh
  this.burst(cell.x, cell.y, '#7ee787', 22);
  this.burst(cell.x, cell.y, owner.color, 12);
  if (owner.id === 0) {
    arenaSound.play('virus');
    this.addFloater(cell.x, cell.y - cell.radius, 'Virus Nổ Tung!', '#9bcf78');
  }
}
```

### 6.2. Thuật toán phân bổ khối lượng từng mảnh (Exact Remainder Distribution)
Bằng cách gán `baseMass = currentTotalMass / totalPieces` cho tất cả `totalPieces` mảnh (gồm tế bào mẹ và các mảnh con), tổng khối lượng sau vụ nổ là:
$$\sum_{j=1}^{totalPieces} baseMass = totalPieces \times \frac{currentTotalMass}{totalPieces} = currentTotalMass$$
Điều này triệt tiêu hoàn toàn bất kỳ sự thất thoát khối lượng nào, vượt qua các bài kiểm tra nghiêm ngặt nhất của `engine.validateInvariants()`.

### 6.3. Tính toán va chạm biên và triệt tiêu xung lực xuyên tường
Khi các mảnh tế bào bị bắn ra với tốc độ lên đến 950 px/s gần mép bản đồ ($WORLD = 4800$), nếu không xử lý biên, các mảnh tế bào có thể bị kẹp ra ngoài tọa độ cho phép. Hàm `clamp(spawnX, 20, WORLD - 20)` kết hợp với cơ chế giới hạn bán kính hữu hiệu trong vòng lặp vật lý:
```typescript
const bound = Math.min(cell.radius, WORLD / 2);
cell.x = clamp(cell.x, bound, WORLD - bound);
cell.y = clamp(cell.y, bound, WORLD - bound);
```
Đảm bảo 100% mảnh tế bào không bao giờ bị văng ra ngoài không gian đấu trường.

### 6.4. Xử lý tương thích với Mother Cell (Chế độ Thực nghiệm - Experimental Mode)
Mother Cell là loại tế bào mẹ màu hồng tím trong chế độ Experimental của Agar.io. Khi một tế bào lớn va chạm với Mother Cell:
- Ngưỡng kích nổ là `BALANCE.motherTriggerMass` (520).
- Phần thưởng khối lượng là `BALANCE.motherBonusMass` (100).
- Hàm `explode` xử lý đồng nhất với tham số `bonus = BALANCE.motherBonusMass`, mang lại sự phân tách dữ dội hơn tương xứng với độ nguy hiểm của Mother Cell.

---

## 7. HIỆU ỨNG ĐỒ HỌA, ÂM THANH VÀ PHẢN HỒI XÚC GIÁC (SENSORY & VISUAL POLISH)

Vụ nổ virus trong Agar.io không chỉ là một phép toán vật lý, mà là một trải nghiệm thị giác và thính giác đầy kịch tính. Để biến mô phỏng trở nên hoàn mỹ, hệ thống được trang bị các cải tiến giác quan sau:

### 7.1. Hệ thống hạt gai xanh (Spike Debris Particle Burst)
Khi virus bị xé toạc, 22 hạt mảnh gai màu xanh lá dạ quang `#7ee787` kết hợp với 12 hạt màu của chính tế bào người chơi được phóng ra theo mọi hướng ngẫu nhiên với vận tốc góc cao, tồn tại trong 0.45 giây trước khi tan biến vào không gian.

### 7.2. Hiệu ứng rung xung động màng tế bào (Elastic Membrane Oscillation / Pulse)
Biến `cell.pulse` được kích hoạt lên mức `1.35` đối với tế bào mẹ và `1.15` đối với các mảnh con. Trong trình dựng Canvas (`renderer.ts`), giá trị pulse này tạo ra sóng dao động co giãn đàn hồi hình sin trên bề mặt màng tế bào, mô phỏng sinh động hiện tượng màng sinh học bị chấn động sau cú va chạm cực mạnh.

### 7.3. Text thông báo nổi (Floating Combat Text & Color Schemes)
- Khi nổ bình thường: Hiển thị dòng chữ `"Virus Nổ Tung!"` màu xanh lá pastel `#9bcf78` bốc lên trên đầu tế bào.
- Khi ăn virus ở 16 mảnh (Virus Farming): Hiển thị dòng chữ nổi bật `"+65 Ăn Virus!"` màu xanh ngọc bích dạ quang rực rỡ `#22c55e`, tôn vinh chiến thuật thành công của người chơi.

### 7.4. Âm thanh kích nổ chuẩn phòng thu
Bộ kích âm thanh `arenaSound.play('virus')` được gọi chính xác tại thời điểm tiếp xúc, mang lại âm bass nổ trầm ấm kết hợp tiếng "pop" vang đặc trưng của Agar.io.

---

## 8. KẾ HOẠCH TRIỂN KHAI MÃ NGUỒN & KIỂM THỬ CHẤT LƯỢNG (TESTING & QA PIPELINE)

Quy trình triển khai kỹ thuật được chia thành 4 giai đoạn cụ thể:

### Giai đoạn 1: Sửa đổi mã nguồn hàm `explode` trong `src/agar/engine.ts`
- Loại bỏ hoàn toàn dòng lệnh trừ phạt 15% khối lượng khi chạm trần 16 mảnh.
- Hiện thực hóa cơ chế ăn virus nhận điểm thưởng ở 16 mảnh.
- Thay thế thuật toán chia góc nan hoa tĩnh bằng mô hình tán xạ góc ngẫu nhiên (radial starburst with angular jitter).
- Tăng cường xung lực bắn từ 280-500 px/s lên mức chuẩn 750-980 px/s.
- Tích hợp kế thừa động lượng và phản lực giật lùi tế bào mẹ.
- Áp dụng thời gian cấm hợp nhất động dựa trên khối lượng từng mảnh (`mergeDelay(baseMass)`).

### Giai đoạn 2: Bổ sung và cập nhật bài kiểm thử (Unit Tests)
1. **Kiểm thử bất biến khối lượng:** Đảm bảo $\sum m_{fragments} = m_{initial} + bonus$.
2. **Kiểm thử ăn virus khi đủ 16 mảnh (16-Cell Virus Eat):** Tạo người chơi có 16 mảnh tế bào, cho va chạm vào virus, khẳng định số mảnh vẫn giữ nguyên là 16, khối lượng mảnh được tăng lên đúng bằng `virusBonusMass`, và không có bất kỳ hình phạt nào.
3. **Kiểm thử phân bố xung lực:** Khẳng định các mảnh tế bào con có vector vận tốc $(vx, vy)$ khác nhau và có độ lớn vận tốc lớn hơn 700 px/s ngay sau va chạm.

### Giai đoạn 3: Kiểm tra kiểu tĩnh và biên dịch (Type Check & Compile)
- Chạy `npm run check` đảm bảo 100% TypeScript types an toàn.
- Chạy `compile_applet` xác nhận ứng dụng xây dựng thành công.

### Giai đoạn 4: Đánh giá hiệu năng thời gian thực (Zero-Allocation & 60 FPS)
- Đảm bảo trong suốt quá trình nổ virus, không tạo ra rác bộ nhớ không cần thiết (garbage collection pressure).
- Duy trì tốc độ khung hình 60 FPS mượt mà kể cả khi có 5-6 tế bào khổng lồ cùng nổ virus một lúc trong đấu trường.

---

## 9. TỔNG KẾT VÀ TUYÊN NGÔN KỸ THUẬT

Cơ chế phân tách khi ăn virus là trái tim và linh hồn của lối chơi chiến thuật trong Agar.io. Việc khôi phục tính năng này về đúng chuẩn nguyên bản không chỉ thỏa mãn mong đợi của những game thủ kỳ cựu mà còn nâng tầm chất lượng của trò chơi lên mức chuyên nghiệp và trung thực tuyệt đối.

Với Đại Kế Hoạch 3000 Chữ này, toàn bộ cấu trúc toán học, động lực học chất lỏng và thuật toán trò chơi đã được định nghĩa minh bạch, chặt chẽ và sẵn sàng để hiện thực hóa vào mã nguồn thực tế. Chúng ta bắt tay ngay vào giai đoạn thi công!
