# FinTrack ← MoneyNote: đồng bộ cách tính, dữ liệu & hiển thị
(viết lại 29/10/2026 · MoneyNote v44)

> **Cách dùng:** mở phiên làm việc FinTrack, dán toàn bộ file này và nói:
> *"Sửa FinTrack theo đúng prompt này, cả bản điện thoại và desktop. Làm theo thứ tự mục 1 → 7. Báo lại kết quả mục 8."*

FinTrack và MoneyNote dùng **chung một Firestore doc `fintrack/main`** (payload JSON + `_seq`, `_deviceId`, `_updatedAt`). MoneyNote là nơi quản lý thẻ tín dụng / trả góp / nợ. FinTrack phải tính **y hệt** và **không được ghi đè** dữ liệu MoneyNote quản lý.

---

## 1. KHẨN · Ngừng ghi đè dữ liệu (đã gây lỗi thật)
Ngày 28/10/2026 FinTrack đã ghi đè:
- Pru 3 kỳ (thẻ MB, 3 × 2.681.000): `startStmt` **2026-08 → 2026-07** → app tưởng đã trả đủ, sao kê MB tụt từ 3.544.867 xuống 863.867.
- Thẻ VP: `instFeeMonthly` bị gán lại **2.494.190** (đúng là **0**).

Việc phải làm:
1. Xoá/vô hiệu **mọi seed & migration** trong FinTrack có gán cho thẻ/khoản góp/khoản nợ đã tồn tại các trường: `instFeeMonthly, stmtOverride, stmtOverrideKey, startStmt, paid, lastStmt, lastPayMonth, lastPayDate, limit, opening, stDay, dueDay, fee, feeMode, rate, rateMode`. Tìm theo các cờ `_lionFix*, _vpFix*, _vibFix*, _vibDefer*, _vibAvail*, _vibDue*, _vpLimit*, _vibSync*, _vpSync*, _mbSync*, _vibLimitReal` và mọi số cứng (vd `2494190`, `15386829`, `17931074`, `27291335`, `68702501`).
2. **Giữ nguyên trường lạ** khi lưu — không lọc/đổi tên: `feeMode, fee, rateMode, rate, stmtOverride, stmtOverrideKey, startStmt`, mọi cờ `_xxx`.
3. Khi lưu ghi thêm `_app: 'fintrack'` vào doc (MoneyNote ghi `_app: 'moneynote'`).

## 2. Đồng bộ an toàn (gộp 3 chiều theo id)
MoneyNote v42+ làm như sau — FinTrack làm y hệt:
- **Trước khi setDoc**: `getDoc` bản trên server. Nếu `_seq` server > seq máy này đã đẩy và `_deviceId` khác → **gộp 3 chiều** (`ftMerge(local, cloud, base)`) rồi mới ghi. Không bao giờ ghi đè cả mảng `accounts/installments/debts/transactions` bằng bản cũ trong bộ nhớ.
- Gộp theo `id` từng phần tử: phần tử chỉ một bên sửa (so hash với base) → lấy bên đã sửa; bên kia xoá mà bên này không sửa → xoá.
- **Trường do MoneyNote quản lý (FT_OWN)** — khi nhận dữ liệu, FinTrack **không được** đổi các trường này; muốn sửa thì sửa trong MoneyNote:
```js
const FT_OWN={accounts:['instFeeMonthly','stmtOverride','stmtOverrideKey'],
  installments:['startStmt','feeMode','fee','rateMode','rate'],
  debts:['feeMode','fee','rateMode','rate']};
```
  MoneyNote có `ftProtect()`: khi nhận bản có `_app !== 'moneynote'`, nó đặt lại các trường trên theo giá trị của chính nó.
- Cách dễ nhất: **copy nguyên file `moneynote-core.js`** của MoneyNote (xem mục 7) — trong đó có `ftH, ftBaseOf, ftMerge, ftDecide, ftProtect, FT_OWN`.

## 3. Thẻ tín dụng — nguồn duy nhất `cardStmtClosed → cardDebtInfo`
Mọi nơi (dự báo, lịch trả thẻ, tài sản ròng, cảnh báo, số dư) chỉ đọc từ 2 hàm này. Không viết công thức riêng.
- **Kỳ sao kê**: (ngày chốt trước, ngày chốt] theo `stDay`; hạn trả = `dueDay` sau ngày chốt.
- **Sao kê phải trả** = chi tiêu trong kỳ + kỳ góp thuộc sao kê + nợ liên kết + phí/lãi góp − mọi khoản chuyển vào thẻ từ ngày chốt. Có `stmtOverride` với `stmtOverrideKey` = ngày chốt → dùng số ngân hàng đó.
- **Dư nợ thẻ** = sao kê còn phải trả + chi tiêu kỳ đang mở + gốc góp chưa lên sao kê + nợ liên kết. Phí/lãi **không** cộng vào dư nợ.
- Khi user đưa số sao kê thật: ghi `stmtOverride` + `stmtOverrideKey`, không chỉnh `opening`/`paid`.

## 4. Trả góp
- Mỗi khoản có `startStmt` (YYYY-MM sao kê chứa kỳ 1). Kỳ trong sao kê tháng M = M − startStmt + 1 (1…term).
- `paid` **tự tính lại mỗi lần mở app** (`instSync`) — KHÔNG cộng tay khi trả thẻ, KHÔNG +1 khi qua ngày chốt.
- **Không tự suy lại `startStmt` nếu đã có.** Chỉ suy khi trống: tạo sau ngày chốt → kỳ 1 vào sao kê sau; sửa "đã trả X kỳ" → startStmt = sao kê vừa chốt − X tháng.
- **Phí & lãi từng khoản** (`instExtraAt(i,k)`, k=0 là kỳ 1): `feeMode` none | once (cả `fee` vào kỳ 1) | split (chia đều, kỳ cuối nhận phần dư); `rateMode` none | flat (`rate`%/tháng × total) | reducing (`rate`%/tháng × (total − k×per)). Vào mục "Lãi & phí trả góp" của sao kê/dự báo/lịch trả. `instFeeMonthly` của thẻ là phí chung, chỉ cộng tháng còn kỳ góp.
- Khoản nợ (`debts`) có cùng bộ `feeMode/fee/rateMode/rate` (`debtFeeAt`).

## 5. Số liệu thật phải khớp (29/10/2026)
- **VP**: `instFeeMonthly = 0`; mọi khoản góp VP `feeMode='none', rateMode='none'`. Sao kê ≈ 20.296.732.
- **MB**: phí 97.200/kỳ khi còn khoản góp. Pru 3 kỳ **startStmt 2026-08** (đã trả 2/3, kỳ 3 trong sao kê chốt 10/10, hạn 25/10). Pru 6 kỳ startStmt 2026-11. Sao kê chốt 10/10 = **3.544.867**; tổng nợ ≈ 11.6tr.
- **Số dư đầu trang (Tổng quan)** = thu − chi tháng này (+ lãi dịch vụ/đầu tư) = **44.910.478 đ** (tháng 10/2026). **Không trừ thêm "nợ trả hàng tháng" (monthlyDebtDue)** — tiền trả nợ đã là giao dịch chuyển khoản trong sổ, trừ nữa là trừ hai lần. Tab Thu chi: thu − chi cá nhân, không trừ nợ.

## 6. Hiển thị
**a) Cách ghi số tiền** — làm trong hàm định dạng, KHÔNG dùng script sửa chữ trên DOM:
```js
const fmtFull=n=>new Intl.NumberFormat('vi-VN').format(Math.round(+n||0))+' đ';
function fmtK(n){n=+n||0;const a=Math.abs(n),g=(v,d)=>String(+v.toFixed(d));if(a>=1e9)return g(n/1e9,2)+'tỷ';if(a>=1e6)return g(n/1e6,2)+'tr';if(a>=1e3)return g(n/1e3,1)+'K';return String(Math.round(n))}
const fmt=n=>fmtK(n);
```
- Mọi số trong danh sách/thẻ/sao kê: `fmtK`, **không "đ"** (3.54tr, 8tr, 97.2K, 1.2tỷ). Bỏ mọi `+' đ'` / `} đ` sau fmtK.
- **Mọi số tiền hiển thị đều dùng `fmtK`**, RIÊNG số dư đầu trang dùng `fmtFull` (44.910.478 đ) — "Phải trả kỳ này", "Tổng nợ hiện tại", Ghi nhanh, hộp thoại, xem trước trong form (cập nhật 29/10/2026). `formatMoney` (đầy đủ) chỉ cho giá trị trong ô nhập & máy tính. `fmtFull` giữ trong lõi nhưng không dùng để hiển thị.

**b) Chi tiết nợ thẻ — dòng "Trả góp · tên (x/y kỳ)"**: hiện đến khi sao kê chứa kỳ cuối đã trả xong. Số = gốc chưa lên sao kê + kỳ trong sao kê đã chốt (nếu sao kê chưa trả xong). Tổng nợ giữ nguyên `cardDebtInfo().total`.
```js
lkInst.filter(i=>instRemNow(i,CI.closeStr)>0||(CI.stmt>0&&instInStmt(i,CI.closeStr)>0))
  .map(i=> ... fmtK(instRemNow(i,CI.closeStr)+(CI.stmt>0?instInStmt(i,CI.closeStr):0)) ...)
```
**c) "Phải trả kỳ này (sao kê chốt dd/mm)"**: số không rớt dòng — flex `gap:8px`, nhãn `min-width:0`, số `white-space:nowrap;flex-shrink:0`.

**d) Tổng quan gọn hơn**: gộp "Cảnh báo ngân sách" vào khối "Cảnh báo" (một tiêu đề); Tài sản ròng, Mục tiêu, Báo cáo năm **thu gọn mặc định** (chỉ khi user chưa từng chọn). Thu chi hiện 10 ngày, "Xem thêm" +14 ngày.

**e) Hộp thoại**: thay `confirm/prompt/alert` của trình duyệt bằng sheet trượt lên trong app (nút cao ≥48px, nút xoá màu đỏ, Huỷ bên trái). Ưu tiên toast "Hoàn tác" thay vì hỏi xác nhận.

**f) Vùng chạm & nhãn**: nút nhỏ (◀ ▶, "Chỉnh sửa", "Xem tất cả", "+ Thêm") có vùng chạm ≥44pt (dùng `::after` âm inset, không đổi bố cục); nút chỉ có biểu tượng phải có `aria-label`.

## 7. Lõi tính toán dùng chung
MoneyNote đã tách toàn bộ phần tính vào **`moneynote-core.js`** (nạp bằng `<script src="moneynote-core.js?v=N">` ngay trước script chính). Gồm: `fmtK, fmt, fmtFull, fmtVnd`, `acctBalance`, `stmtDateOf, lastStmtDate, cardStmtClosed, stmtSplit, stmtParts, stmtSplitTxt, nextDueDate, cardDebtInfo, cardTotDebt, cardsDebtTotal, cardSpendCycle, cardInstDue`, `inst*` (instMo, instSync, instInStmt, instExtraAt, instFeeInStmt, instPartsMonth, instRemaining, instRemNow…), `debtTermOf, debtFeeAt, debtFeeNext, debtFeeLeft`, `ftH, ftIsIdArr, ftBaseOf, ftMerge, ftDecide, ftProtect, FT_OWN`.
- **Khuyến nghị:** FinTrack copy nguyên file này (lấy từ thư mục deploy MoneyNote), xoá các hàm trùng tên trong HTML của FinTrack (nếu để lại sẽ đè lên lõi), nạp file trước script chính. Lõi đọc các biến toàn cục `db, today, monthOf, acctById, ensureInst, localSeq, DEVICE_ID, ftPushed, ftGetBase` lúc chạy — FinTrack cần có các tên này (thường đã có).
- Khi MoneyNote cập nhật lõi → copy lại file sang FinTrack, không sửa riêng.

## 8. Kiểm thử bắt buộc (báo lại kết quả)
1. Mở FinTrack → đóng → mở MoneyNote → mở lại FinTrack (2 vòng): Pru 3 kỳ vẫn `startStmt 2026-08, paid 2`; VP `instFeeMonthly 0`.
2. Sao kê MB chốt 10/10 = 3.544.867; VP ≈ 20.296.732; tổng nợ MB ≈ 11.6tr — giống MoneyNote.
3. Số dư đầu trang tháng 10/2026 = 44.910.478 đ, giống MoneyNote điện thoại & desktop.
4. Sửa 1 giao dịch ở FinTrack và 1 giao dịch khác ở MoneyNote cùng lúc (cách nhau < 5 giây) → cả hai thay đổi đều còn sau khi đồng bộ.
5. Thẻ MB chưa trả sao kê 10/10: chi tiết nợ hiện Phuong Nam 766.7K, Pru 3 kỳ 2.68tr, Pru 6 kỳ 8.04tr. Trả đủ 3.544.867 → hai dòng đầu tự ẩn.
6. Không còn `confirm(`/`prompt(`/`alert(` hiện hộp thoại trình duyệt; console không lỗi.

---
<details><summary>Phụ lục: prompt cũ (trước 29/10/2026) — chỉ để tham khảo</summary>

# Đồng bộ THẺ TÍN DỤNG, TRẢ GÓP & PHÍ KHOẢN NỢ: MoneyNote → FinTrack
(cập nhật 28/10/2026, MoneyNote ver 40+)

> **Cách dùng:** dán toàn bộ file này vào phiên làm việc của FinTrack, rồi nói: *"Sửa FinTrack theo đúng prompt này, cả bản điện thoại và desktop. Làm mục 0 trước tiên."*

## 0a. Từ MoneyNote v42 (29/10/2026)
- MoneyNote ghi thêm `_app: 'moneynote'` khi lưu. FinTrack hãy ghi `_app: 'fintrack'` vào doc khi lưu.
- Khi nhận dữ liệu từ app khác, MoneyNote **giữ giá trị của chính nó** cho các trường: accounts `instFeeMonthly, stmtOverride, stmtOverrideKey`; installments `startStmt, feeMode, fee, rateMode, rate`; debts `feeMode, fee, rateMode, rate`; và mọi cờ `_xxx`. FinTrack sửa các trường này sẽ bị MoneyNote đặt lại → hãy sửa chúng trong MoneyNote.
- Trước khi ghi, MoneyNote đọc bản trên server; nếu có bản mới hơn từ máy/app khác thì gộp 3 chiều theo id rồi mới ghi. FinTrack nên làm y hệt (getDoc → nếu `_seq` server > seq đã đẩy → ftMerge → setDoc).
- Cách hiện số: `fmtK` 2 chữ số thập phân, bỏ số 0 thừa (3.54tr, 8tr, 97.2K), không "đ"; `fmtFull` (đầy đủ + " đ") cho số dư đầu trang, "Phải trả kỳ này", "Tổng nợ hiện tại", Ghi nhanh. Không dùng script sửa chữ trên DOM.

## 0. LỖI ĐANG XẢY RA, SỬA TRƯỚC TIÊN: FinTrack ghi đè dữ liệu của MoneyNote
Ngày 28/10/2026 phát hiện FinTrack đã ghi đè hai chỗ trong Firestore `fintrack/main`:
- Khoản góp **Pru 3 kỳ** (thẻ MB, id `in_1787567086422`, 3 × 2.681.000) bị đổi `startStmt` từ **2026-08** về **2026-07**, nên app hiểu là đã trả đủ 3/3, ẩn khoản này và sao kê MB tụt từ 3.544.867 xuống 863.867.
- Thẻ VP bị gán lại `instFeeMonthly = 2494190` (đúng ra là **0**), nên sao kê VP bị cộng thêm 2.494.190 phí ảo.

Việc phải làm:
1. **Tìm và xoá/vô hiệu mọi đoạn seed/migration** trong FinTrack có gán: `instFeeMonthly` (nhất là `=2494190`, cờ `_vpSync2609`), `startStmt`, `paid`, `lastPayDate`, `lastPayMonth`, `stmtOverride`, `stmtOverrideKey`, `fee`, `feeMode`, `rate`, `rateMode` cho thẻ hoặc khoản góp có sẵn. Thay giá trị cố định trong seed bằng **0 / không gán**.
2. **Khi FinTrack lưu (save/setDoc), không được ghi lại bản `db` cũ đang giữ trong bộ nhớ đè lên bản mới hơn trên Firebase.** Trước khi ghi phải đọc bản mới nhất (onSnapshot đã nhận) và chỉ ghi phần FinTrack thực sự sửa. Nếu bản trên server có `updatedAt` mới hơn bản đang sửa → gộp theo từng phần tử (theo `id`), không ghi đè cả mảng `installments` / `accounts`.
3. **Không tự suy lại `startStmt` nếu khoản góp đã có `startStmt`.** Chỉ suy ra khi trường này trống (xem `instSync` ở mục a). FinTrack không được có công thức riêng cộng/trừ tháng cho `startStmt`.
4. Giữ nguyên mọi trường lạ mà FinTrack không biết (`feeMode`, `fee`, `rateMode`, `rate`, `stmtOverride`, `stmtOverrideKey`, cờ `_mbPru3fix`, `_vpFee0`…) khi lưu — không lọc bỏ.
5. Sau khi sửa, kiểm tra: mở FinTrack → đóng → mở MoneyNote: Pru 3 kỳ vẫn `startStmt = 2026-08`, `paid = 2`; VP `instFeeMonthly = 0`. Mở lại FinTrack lần nữa, kiểm tra lại lần nữa.

(MoneyNote hiện có đoạn tự sửa lại Pru 3 kỳ mỗi lần mở app để chống ghi đè; khi FinTrack đã hết ghi đè thì đoạn đó vô hại.)

## Bối cảnh
FinTrack và MoneyNote dùng chung dữ liệu Firebase (doc `fintrack/main`). MoneyNote vừa đổi cách tính thẻ tín dụng và trả góp, và đã thêm trường dữ liệu mới. FinTrack cần sửa **giống hệt**, nếu không hai app sẽ hiện số khác nhau, hoặc ghi đè sai trường `paid` của nhau.

## Việc cần làm trong FinTrack
Làm ở **cả bản điện thoại và bản desktop** của FinTrack.

### 1. Trả góp: chuyển sang `startStmt` (QUAN TRỌNG NHẤT)
- Mỗi khoản trong `db.installments` có thêm trường **`startStmt`** (chuỗi `YYYY-MM`): tháng của sao kê chứa **kỳ 1**.
- Kỳ nằm trong sao kê chốt tháng M = (M − startStmt) + 1, tính từ 1 đến term.
- `paid` **không còn là số đếm tay**. Mỗi lần mở app, `paid` được tính lại = số kỳ nằm ở các sao kê *trước* sao kê vừa chốt (qua `instSync`).
- Khoản cũ chưa có `startStmt` sẽ được tự suy ra một lần từ `paid`, `lastPayDate` / `lastPayMonth` và ngày tạo (lấy từ id `in_<timestamp>`).
- **Xoá hẳn** các chỗ tự +1 kỳ:
  - `autoAdvanceInst` kiểu cũ: +1 kỳ mỗi khi qua ngày chốt.
  - `maybeAdvanceInst`: hỏi "có gồm kỳ trả góp không?" khi chuyển tiền vào thẻ. Không cộng kỳ góp nữa, chỉ giữ phần cho **khoản nợ liên kết với thẻ** (`db.debts` có `acct` = thẻ).
- **Form khoản góp:**
  - Tạo mới: nếu đã trả X kỳ thì startStmt = sao kê vừa chốt − X tháng; nếu X = 0 thì startStmt = tháng sau sao kê vừa chốt.
  - Sửa số kỳ đã trả hoặc đổi thẻ: tính lại startStmt theo cùng công thức.

### 2. Sao kê đã chốt (`cardStmtClosed`), dùng chung cho mọi nơi
- Kỳ sao kê là (ngày chốt trước, ngày chốt], theo `stDay`. Ngày 29–31 tự lùi về ngày cuối tháng nếu tháng ngắn (`stmtDateOf` / `lastStmtDate`).
- Phải trả = chi tiêu trong kỳ + Σ `instInStmt(i, ngày chốt)` + kỳ của khoản nợ liên kết + `instFeeMonthly` − **mọi** khoản chuyển vào thẻ từ ngày chốt.
- **Bỏ** phần `paidInst` (trừ kỳ góp theo `lastPayDate`).
- Nếu `stmtOverride` có `stmtOverrideKey` trùng ngày chốt: phải trả = stmtOverride − số đã chuyển vào thẻ.
- Phần trả dư (`over`) được trừ vào chi tiêu kỳ đang mở (`prepaid`).

### 3. Dư nợ thẻ (`cardDebtInfo`): nguồn duy nhất
- Tổng dư nợ = sao kê còn phải trả + chi tiêu kỳ đang mở − phần đã trả trước + gốc góp chưa lên sao kê (`instRemNow`) + nợ liên kết.
- Dự báo dòng tiền, lịch trả thẻ, tài sản ròng, cảnh báo, hạn mức còn lại: **chỉ đọc số từ đây**, không tự viết công thức riêng.

### 4. Dự báo dòng tiền và Lịch trả thẻ
- Kỳ góp các tháng sau phải đếm cả khoản chưa lên sao kê. Khoản tạo sau ngày chốt vẫn đủ `term` kỳ, chỉ dời sang tháng sau.
- Nếu sao kê đã chốt đã trả hết (phải trả = 0) thì **bỏ hạn tháng này**, không đẩy chi tiêu kỳ mới vào hạn hôm nay. Chi kỳ mới thuộc hạn kế tiếp.

### 5. Dữ liệu thật đã chỉnh trong Firebase (FinTrack chỉ cần đọc, KHÔNG ghi đè)
- **Thẻ VP:** `instFeeMonthly = 0`, và mọi khoản góp VP có `feeMode = none`, `rateMode = none` (user xác nhận lại 28/10/2026: VP không có lãi/phí góp). `stmtOverride = 19.511.300`, `stmtOverrideKey = 2026-10-20`, hạn 05/11.
- **Thẻ MB:** phí 97.200/kỳ khi còn khoản góp. Pru 3 kỳ (3 × 2.681.000) có **startStmt 2026-08** → kỳ 3 nằm trong sao kê chốt 10/10, hạn 25/10. Pru 2 (6 kỳ × 1.340.500) có startStmt 2026-11, tức lên sao kê từ 10/11, hạn 25/11.
- Nếu FinTrack có đoạn **seed/migration** gán lại `instFeeMonthly = 2494190` cho VP (cờ `_vpSync2609`) hoặc gán `paid` / `lastPayDate` cho khoản góp: cờ đã bật thì không chạy lại, nhưng **tuyệt đối không viết migration mới đè các trường này**.

### 6. Phí & lãi riêng từng khoản góp (trường mới trong `db.installments`)
- `feeMode`: `none` | `once` (toàn bộ `fee` vào kỳ 1) | `split` (`fee` chia đều các kỳ, kỳ cuối nhận phần lẻ).
- `rateMode`: `none` | `flat` (`rate` %/tháng × `total`) | `reducing` (`rate` %/tháng × dư nợ gốc còn lại = total − k×per).
- Phí + lãi của kỳ: cộng vào phần "Lãi & phí trả góp" của sao kê đã chốt (`instFeeInStmt`), của dự báo dòng tiền và của lịch trả thẻ (`instPartsMonth`). **Không** tính vào dư nợ thẻ, dư nợ chỉ gồm gốc.
- `instFeeMonthly` của thẻ vẫn là phí chung, chỉ cộng vào tháng nào còn kỳ góp.
- Khoản đã tất toán (`settled`): `instSync` giữ nguyên `paid = term`.
- Form khoản góp có thêm 4 ô: Phí chuyển đổi (chọn kiểu), Phí (đ), Lãi (chọn kiểu), Lãi suất %/tháng, kèm dòng xem trước số tiền kỳ 1, các kỳ sau và tổng phí + lãi.

```js
// Phí & lãi của khoản góp ở kỳ thứ k (0 = kỳ 1). feeMode: none|once (cả phí vào kỳ 1)|split (chia đều các kỳ). rateMode: none|flat (%/tháng × gốc ban đầu)|reducing (%/tháng × dư nợ gốc còn lại)
function instExtraAt(i,k){if(!i||k<0||k>=i.term)return 0;let x=0;const f=+i.fee||0;
  if(f){if(i.feeMode==='once')x+=k===0?f:0;else if(i.feeMode==='split'){const b=Math.floor(f/i.term);x+=k===i.term-1?f-b*(i.term-1):b}}
  const r=(+i.rate||0)/100;if(r&&(i.rateMode==='flat'||i.rateMode==='reducing')){const P=+i.total||0;const base=i.rateMode==='reducing'?Math.max(0,P-k*(+i.per||0)):P;x+=Math.round(base*r)}
  return x}
function instFeeInStmt(i,cs){if(i.settled)return 0;if(!i.startStmt)instSync(i);return instExtraAt(i,instMo(cs)-instMo(i.startStmt))}
// Góp phải trả trong sao kê tháng mo (số tháng tuyệt đối): p = gốc, f = phí + lãi (gồm phí chung của thẻ instFeeMonthly)
function instPartsMonth(list,mo,card){let p=0,f=0,any=false;(list||[]).forEach(i=>{if(i.settled)return;if(!i.startStmt)instSync(i);const k=mo-instMo(i.startStmt);if(k>=0&&k<i.term){any=true;p+=+i.per||0;f+=instExtraAt(i,k)}});if(any)f+=(+(card&&card.instFeeMonthly)||0);return {p,f}}
function instExtraTotal(i){let s=0;for(let k=0;k<(i.term||0);k++)s+=instExtraAt(i,k);return s}
function instExtraLeft(i){let s=0;for(let k=(i.paid||0);k<(i.term||0);k++)s+=instExtraAt(i,k);return s}
```

### 7. Phí riêng từng KHOẢN NỢ (trường mới trong `db.debts`)
- Hai trường mới: `feeMode` và `fee`. Chỉ dùng khi khoản nợ có kiểu trả "Theo kỳ"; khoản "Linh hoạt" luôn là `feeMode = 'none'`, `fee = 0`.
- Bốn kiểu `feeMode`:
  - `none`: không phí.
  - `once`: toàn bộ `fee` vào kỳ 1.
  - `split`: chia đều `fee` cho số kỳ, kỳ cuối nhận phần lẻ.
  - `fixed`: `fee` là phí cố định của mỗi kỳ.
- Số kỳ `debtTermOf(d)` lấy theo `term`. Nếu `term` = 0 thì số kỳ = paid + làm tròn lên (còn lại ÷ trả mỗi kỳ).
- Phí của kỳ k (k = 0 là kỳ 1) tính bằng `debtFeeAt(d,k)`; phí của kỳ tới là `debtFeeNext(d)` = `debtFeeAt(d, paid)`.
- Phí được cộng vào những chỗ sau:
  - **Trả 1 kỳ** (`payDebtPeriod`): giao dịch ghi gốc + phí, mô tả có "· gồm phí X". `remaining` chỉ trừ phần gốc.
  - **Dự báo dòng tiền:** cộng `debtFeeAt(dd, kk)` cho từng kỳ, với kk bắt đầu từ `paid`. Tên sự kiện có "(gồm phí)".
  - **Sao kê thẻ** (`cardStmtClosed`), với nợ liên kết thẻ: mỗi khoản cộng `monthlyPayment + debtFeeNext(d)`.
  - **Tổng trả hằng tháng** ở tab Nợ, `finCore().debtM` và hộp hỏi khi chuyển tiền vào thẻ: đều cộng `debtFeeNext(d)`.
  - **Danh sách nợ:** dòng phụ hiện "phí kỳ tới X · phí còn Y", hoặc "phí X/kỳ" với kiểu cố định.
- Form khoản nợ có thêm ô chọn **Phí** (`#d-feemode`), ô **Tổng phí / Phí mỗi kỳ** (`#d-fee`) và dòng xem trước `#d-fee-preview`. Khi mở sửa một khoản cũ, form nạp lại `feeMode` và `fee` đã lưu.
- **Dữ liệu cũ:** khoản nào chưa có `feeMode` thì coi là `none`, số liệu không đổi. Người dùng tự mở sửa từng khoản để bổ sung phí.

```js
// Phí của khoản nợ ở kỳ k (0 = kỳ 1). feeMode: none | once (cả phí vào kỳ 1) | split (chia đều số kỳ) | fixed (fee mỗi kỳ)
function debtTermOf(d){if(+d.term>0)return +d.term;const m=+d.monthlyPayment||0;return m>0?(d.paid||0)+Math.ceil((+d.remaining||0)/m):0}
function debtFeeAt(d,k){const f=+d.fee||0;if(!f||!d||k<0)return 0;const n=debtTermOf(d);if(n&&k>=n)return 0;
  if(d.feeMode==='once')return k===0?f:0;if(d.feeMode==='fixed')return f;if(d.feeMode==='split'&&n){const b=Math.floor(f/n);return k===n-1?f-b*(n-1):b}return 0}
function debtFeeNext(d){return debtFeeAt(d,d.paid||0)}
function debtFeeLeft(d){const n=debtTermOf(d);if(!n)return d.feeMode==='fixed'?0:0;let s=0;for(let k=(d.paid||0);k<n;k++)s+=debtFeeAt(d,k);return s}
function debtFeeSync(){const g=id=>document.getElementById(id);if(!g('d-feemode'))return;const m=g('d-feemode').value;g('d-fee-wrap').style.visibility=m==='none'?'hidden':'';g('d-fee-label').textContent=m==='fixed'?'Phí mỗi kỳ (đ)':'Tổng phí (đ)';
  const pv=g('d-fee-preview');const fee=m==='none'?0:getMoneyVal('d-fee');const d={feeMode:m,fee,term:+g('d-term').value||0,paid:+g('d-paid').value||0,monthlyPayment:getMoneyVal('d-monthly'),remaining:getMoneyVal('d-remaining')||getMoneyVal('d-principal')};
  if(!fee){pv.textContent='';return}const n=debtTermOf(d);const per=d.monthlyPayment;
  if(m==='once'){pv.innerHTML='Kỳ 1: <b style="color:var(--text)">'+formatMoney(per+fee)+' đ</b> · các kỳ sau '+formatMoney(per)+' đ';return}
  if(!n){pv.textContent='Nhập số kỳ hoặc số trả mỗi kỳ để tính phí từng kỳ';return}
  const e0=debtFeeAt(d,0);let tot=0;for(let k=0;k<n;k++)tot+=debtFeeAt(d,k);pv.innerHTML='Mỗi kỳ trả <b style="color:var(--text)">'+formatMoney(per+e0)+' đ</b> (gồm phí '+formatMoney(e0)+' đ) · tổng phí '+formatMoney(tot)+' đ / '+n+' kỳ'}
```


### 8. Hiển thị (cập nhật 28/10/2026)
**a) Chi tiết nợ thẻ — dòng "Trả góp · tên (x/y kỳ)"**
- Khoản góp vẫn hiện **cho đến khi sao kê chứa kỳ cuối đã được trả hết**. Chỉ ẩn khi: không còn gốc ngoài sao kê (`instRemNow = 0`) **và** sao kê đã chốt đã trả xong (`CI.stmt = 0`) hoặc khoản không có kỳ trong sao kê đó.
- Số hiện = gốc chưa lên sao kê + (kỳ trong sao kê đã chốt, nếu sao kê chưa trả xong). Dòng "Tổng nợ hiện tại" giữ nguyên `cardDebtInfo().total`, không cộng thêm (tránh trùng).
```js
${lkInst.filter(i=>instRemNow(i,CI.closeStr)>0||(CI.stmt>0&&instInStmt(i,CI.closeStr)>0)).map(i=>`<div style="display:flex;justify-content:space-between"><span style="color:var(--muted)">Trả góp · ${i.name} <span style="font-size:13px">(${i.paid||0}/${i.term} kỳ)</span></span><b style="color:var(--red)">${fmtK(instRemNow(i,CI.closeStr)+(CI.stmt>0?instInStmt(i,CI.closeStr):0))} đ</b></div>`).join('')}
```
- Ví dụ MB khi chưa trả sao kê 10/10: Phuong Nam 767K (kỳ 12/12), Pru 3 kỳ 2.7tr (kỳ 3/3), Pru 6 kỳ 8.0tr, Tổng nợ 11.6tr.

**b) Dòng "Phải trả kỳ này (sao kê chốt dd/mm)"**: số tiền không được rớt dòng — flex có `gap:8px`, nhãn `min-width:0`, số `white-space:nowrap;flex-shrink:0`.

**c) Cách ghi số tiền** (chỉ lớp hiển thị, dữ liệu/file xuất/tin nhắn chia sẻ giữ số đầy đủ):
- Mọi số tiền viết gọn: ≥1 tỷ → `x.xtỷ`, ≥1 triệu → `x.xtr`, ≥1.000 → `xK` (giống `fmtK`). Bỏ ký tự "đ" sau số.
- Giữ nguyên đầy đủ + "đ" ở: số dư đầu trang (`#top-balance`), ô nhập, máy tính, Ghi nhanh.
- MoneyNote làm bằng script `#mn-no-dong` cuối `<body>` (TreeWalker + MutationObserver đổi text node, bỏ qua vùng giữ nguyên). FinTrack có thể copy nguyên script đó từ `app/moneynote.html` của MoneyNote.

**d) Thẻ VP:** mọi khoản góp `feeMode = none`, `rateMode = none`, `instFeeMonthly = 0` — form không được tự điền lại phí/lãi mặc định.

## Số đối chiếu sau khi sửa (21/10/2026)
FinTrack phải ra **đúng** các số này:

**MB** (chốt ngày 10, hạn ngày 25)
- Sao kê còn phải trả: 3.544.867
- Gốc góp còn: 13.024.001
- Lịch trả: 25/10 3.544.867 · 25/11 4.885.367 · 25/12 2.204.367 · 25/01 2.204.367 · 25/02–25/04 1.437.700

**VP** (chốt ngày 20, hạn ngày 05)
- Sao kê còn phải trả: 19.511.300
- Gốc góp còn: 45.179.000
- Lịch trả: 05/11 19.511.300 · 05/12 6.276.000 · 05/01–05/03 5.241.000 · từ 05/04 4.641.000

**Lion** (chốt ngày 10, hạn ngày 28)
- Sao kê còn phải trả: 8.117.000
- Gốc góp còn: 71.312.000
- Lịch trả: 28/10 8.117.000 · từ 28/11 4.457.000

**VIB** (chốt ngày 25, hạn ngày 20)
- Không có khoản góp
- 20/11: 10.244.646 (chi kỳ mới)

## Kiểm thử bắt buộc sau khi sửa
6. Thẻ MB chưa trả sao kê 10/10: chi tiết nợ vẫn hiện Phuong Nam 767K và Pru 3 kỳ 2.7tr; trả đủ 3.544.867 → hai dòng này tự ẩn, tổng nợ còn 8.0tr.
0. Mở FinTrack rồi MoneyNote nhiều lần xen kẽ: Pru 3 kỳ giữ `startStmt 2026-08`, VP giữ `instFeeMonthly 0`, sao kê MB = 3.544.867.
4. Khoản góp 12tr / 12 kỳ: phí một lần 240k → kỳ 1 có +240k, các kỳ sau 0; phí chia đều 240k → 20k mỗi kỳ; lãi trên gốc 1%/tháng → 120k mỗi kỳ; lãi trên dư nợ giảm dần 1%/tháng → kỳ 1 120k, kỳ 2 110k, kỳ 12 10k.
5. Khoản nợ 12tr / 12 kỳ, trả 1tr/kỳ, phí cố định 50k/kỳ: dự báo 1.050.000/kỳ; bấm "Trả 1 kỳ" ghi giao dịch 1.050.000, nợ còn lại 11.000.000.
1. Trả đủ sao kê một thẻ: sao kê còn 0, `paid` của mọi khoản góp **không đổi**, gốc góp còn giữ nguyên.
2. Thêm khoản góp mới hôm nay: sao kê đã chốt không đổi, kỳ 1 vào hạn tháng sau.
3. Mở FinTrack rồi mở MoneyNote: `paid` / `startStmt` không nhảy qua lại giữa hai app.

---

## Code tham chiếu (copy nguyên từ MoneyNote)

### a) Trả góp: startStmt, instSync, autoAdvanceInst
```js
// ══ TRẢ GÓP THẺ · MỘT NGUỒN DUY NHẤT ══
// Mỗi khoản góp lưu startStmt = tháng (YYYY-MM) của sao kê đầu tiên có kỳ 1.
// Kỳ nằm trong sao kê chốt tháng M = (M − startStmt) + 1. Không đếm theo lần trả, không +1 thủ công.
// paid = số kỳ đã nằm ở các sao kê TRƯỚC sao kê vừa chốt (= kỳ đã trả xong); hết kỳ → paid = term.
function instMo(s){s=String(s||'');return +s.slice(0,4)*12+(+s.slice(5,7)-1)}
function instMoStr(n){return Math.floor(n/12)+'-'+String(n%12+1).padStart(2,'0')}
function instLastClose(card){const c=lastStmtDate(card.stDay||1,new Date());return c.getFullYear()+'-'+String(c.getMonth()+1).padStart(2,'0')+'-'+String(c.getDate()).padStart(2,'0')}
function instSetStart(it,paid,cs){const p=Math.max(0,+paid||0);it.startStmt=instMoStr(p>0?instMo(cs)-p:instMo(cs)+1)}
function instSync(it){const c=acctById(it.card);if(!c||c.type!=='credit')return false;const cs=instLastClose(c);
  if(!it.startStmt){const l=it.lastPayDate||it.lastPayMonth||'';let n=(it.paid||0);
    // trạng thái cũ: kỳ trong sao kê vừa chốt = paid+1 nếu khoản đã lên sao kê này
    let billed;if(l)billed=l<cs;else if(n>0)billed=true;else{let d=it.start||it.date||'';if(!d){const m=/(\d{13})/.exec(it.id||'');if(m){const x=new Date(+m[1]);d=x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0')}}billed=d?d<=cs:true}
    if(n>=it.term&&!billed){it.startStmt=instMoStr(instMo(cs)-it.term);}else it.startStmt=instMoStr(instMo(cs)-n-(billed?0:-1));}
  const k=instMo(cs)-instMo(it.startStmt)+1;const np=k>it.term?it.term:Math.max(0,k-1);
  const ch=np!==(it.paid||0)||it.lastStmt!==cs;it.paid=np;it.lastStmt=cs;return ch}
function autoAdvanceInst(){ensureInst();let changed=false;db.installments.forEach(it=>{if(instSync(it))changed=true});if(changed)save();return changed}
```

### b) Sao kê đã chốt
```js
// Ngày chốt sao kê thực tế của tháng (y,m): ngày 29–31 tự lùi về ngày cuối tháng ngắn
function stmtDateOf(y,m,st){return new Date(y,m,Math.min(+st||1,new Date(y,m+1,0).getDate()))}
function lastStmtDate(st,td){td=td||new Date();let c=stmtDateOf(td.getFullYear(),td.getMonth(),st);if(td.getDate()<c.getDate())c=stmtDateOf(td.getFullYear(),td.getMonth()-1,st);return c}
function cardStmtClosed(card){
  // Số phải trả kỳ đã chốt = tổng dư nợ hiện tại − phần quẹt trong kỳ CHƯA chốt (tự gồm dư nợ cũ/ban đầu)
  const st=card.stDay||1;
  const fmtD=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const close=lastStmtDate(st);
  const cStr=fmtD(close);
  const pStr=fmtD(stmtDateOf(close.getFullYear(),close.getMonth()-1,st));
  ensureInst();
  // Chi tiêu đúng trong kỳ = giao dịch phát sinh (pStr, cStr] — không suy ra từ dư nợ hiện tại (tránh bị hụt khi đã có thanh toán bù trừ)
  const spend=(db.transactions||[]).filter(t=>t.group!=='company'&&t.flow==='out'&&(t.account||'')===card.id&&t.date>pStr&&t.date<=cStr).reduce((s,t)=>s+t.amount,0);
  const paidSince=(db.transactions||[]).filter(t=>t.flow==='xfer'&&t.to===card.id&&t.date>=cStr).reduce((s,t)=>s+t.amount,0);
  const inst=db.installments.filter(i=>i.card===card.id).reduce((s,i)=>s+instInStmt(i,cStr),0);
  const dmp=(db.debts||[]).filter(d=>d.acct===card.id&&d.kind!=='receivable'&&(+d.remaining||0)>0&&+d.monthlyPayment&&(d.lastPayDate||d.lastPayMonth||'')<cStr).reduce((s,d)=>s+(+d.monthlyPayment),0);
  const instFee=(+card.instFeeMonthly||0);
  const paidInst=0; // kỳ góp luôn nằm trong sao kê của nó — mọi khoản trả đều trừ vào sao kê
  const _raw=spend+inst+dmp+instFee,_paid=Math.max(0,paidSince-paidInst);
  let stmt=Math.max(0,_raw-_paid),over=Math.max(0,_paid-_raw);
  if(card.stmtOverride!=null&&(!card.stmtOverrideKey||card.stmtOverrideKey===cStr)){stmt=Math.max(0,(+card.stmtOverride)-paidSince);over=Math.max(0,paidSince-(+card.stmtOverride))}
  // over = phần trả vượt sao kê đã chốt → trừ vào chi tiêu kỳ đang mở (trả trước)
  return {stmt,over,spend,inst:inst+dmp+instFee,instOnly:inst+dmp,fee:instFee,paidSince,closeStr:cStr};
}
function stmtSplit(a){const s=cardStmtClosed(a);const pay=s.stmt||0;let spend=s.spend||0,inst=s.instOnly!=null?s.instOnly:(s.inst||0),fee=s.fee||0;const raw=spend+inst+fee;if(raw>pay&&raw>0){const k=pay/raw;spend=Math.round(spend*k);inst=Math.round(inst*k);fee=Math.max(0,pay-spend-inst)}let other=Math.max(0,pay-spend-inst-fee);if(other<50000){spend+=other;other=0}return {pay,spend,inst,fee,other,s}}
```

### c) Dư nợ thẻ và helper trả góp
```js
function instRemaining(i){const per=+i.per||0,left=Math.max(0,(i.term||0)-(i.paid||0));return per&&i.term?per*left:Math.max(0,(+i.total||0)-(i.paid||0)*per)}
// Khoản góp đã lên sao kê chốt cStr chưa: có kỳ trả trước cStr, hoặc đã trả ≥1 kỳ, hoặc tạo trước ngày chốt (khoản mới tạo sau ngày chốt → kỳ sau mới phát sinh)
function instBilled(i,cs){if(!i.startStmt)instSync(i);return i.startStmt?instMo(cs)>=instMo(i.startStmt):true}
function instInStmt(i,cs){if(!i.startStmt)instSync(i);const k=instMo(cs)-instMo(i.startStmt);return k>=0&&k<i.term?(+i.per||0):0}
function instRemNow(i,cs){return Math.max(0,instRemaining(i)-instInStmt(i,cs))}
/* ── NGUỒN DUY NHẤT: nợ từng thẻ = sao kê đã chốt còn phải trả + chi tiêu kỳ mới + gốc trả góp chưa vào sao kê + nợ liên kết ── */
function cardDebtInfo(a){ensureInst();const s=cardStmtClosed(a),cs=s.closeStr;
  const cycTx=(db.transactions||[]).filter(t=>t.group!=='company'&&t.flow==='out'&&(t.account||'')===a.id&&t.date>cs);
  const cyc=cycTx.reduce((x,t)=>x+t.amount,0);
  const insts=db.installments.filter(i=>i.card===a.id&&(i.paid||0)<i.term);
  const instRem=insts.reduce((x,i)=>x+instRemNow(i,cs),0);
  const linked=(db.debts||[]).filter(d=>d.acct===a.id&&d.kind!=='receivable'&&!d.settled).reduce((x,d)=>x+(+d.remaining||0),0);
  const prepaid=Math.min(cyc,s.over||0);
  const revolving=(s.stmt||0)+cyc-prepaid;
  return {stmt:s.stmt||0,cyc,prepaid,cycN:cycTx.length,cycTx,instRem,insts,linked,revolving,total:revolving+instRem+linked,closeStr:cs,s,avail:a.limit?Math.max(0,a.limit-(revolving+instRem+linked)):null}}
```

### d) Dự báo dòng tiền: phần thẻ (trong forecastData)
```js
if(nx>tdS)events.push({date:nx,name:(r.desc&&r.category&&!String(r.desc).toLowerCase().includes(String(r.category).toLowerCase())?r.category+' · '+r.desc:(r.desc||r.category)),amt:isIn?+r.amount:-r.amount,type:'Định kỳ'});
      last=nx;
    }});
  ensureInst();
  (db.accounts||[]).forEach(a=>{
    if(a.type!=='credit'||!a.dueDay)return;let CI;try{CI=cardDebtInfo(a)}catch(e){return}
    const nm=String(a.name||'').replace(/^thẻ\s+/i,'');let sPay=0;try{sPay=stmtSplit(a).pay||0}catch(e){sPay=CI.stmt||0}
    const per=k=>{const l=CI.insts.filter(i=>i.term-(i.paid||0)-(instInStmt(i,CI.closeStr)?1:0)>k);return l.reduce((x,i)=>x+(+i.per||0),0)+(l.length?(+a.instFeeMonthly||0):0)};
    let d=nextDueDate(a);if(!d)return;
    let dueOfClosed=sPay>0;try{if(!dueOfClosed&&CI.closeStr){const c=new Date(CI.closeStr+'T00:00:00'),nc=new Date(c.getFullYear(),c.getMonth()+1,c.getDate());dueOfClosed=d>c&&d<=nc}}catch(e){}
    if(dueOfClosed){if(sPay>0&&d>=td&&d<=end)events.push({date:iso(d),name:'Hạn thẻ '+nm+' · sao kê đã chốt',amt:-sPay,type:'Thẻ'});d=new Date(d.getFullYear(),d.getMonth()+1,a.dueDay)}
```

### e) Lịch trả thẻ: số kỳ góp các tháng sau (trong cardCalData)
```js
const feeK=k=>insts.some(i=>i.term-(i.paid||0)+(S.closeStr&&!instBilled(i,S.closeStr)?1:0)>k)?(+a.instFeeMonthly||0):0;
    let cyc=0;try{cyc=cardSpendCycle(a)||0}catch(e){}
    const insts=db.installments.filter(i=>i.card===a.id&&(i.paid||0)<i.term);
    const nb=i=>S.closeStr&&!instBilled(i,S.closeStr)?1:0;const g=k=>insts.filter(i=>i.term-(i.paid||0)+nb(i)>k).reduce((s,i)=>s+i.per,0);
```

### f) Form khoản góp (saveInst): thay đoạn lưu
```js
{const _c=acctById(card);const _cs=_c&&_c.type==='credit'?instLastClose(_c):null;let it;if(editInstId){it=db.installments.find(x=>x.id===editInstId);if(it){const pc=paid!==(it.paid||0)||it.card!==card;Object.assign(it,{name,card,total,per,term,paid});if(pc&&_cs)instSetStart(it,paid,_cs)}}
  else{it={id:'in_'+Date.now(),name,card,total,per,term,paid};if(_cs)instSetStart(it,paid,_cs);db.installments.push(it)}if(it)instSync(it)}
```

### g) maybeAdvanceInst: không cộng kỳ góp nữa
```js
const list=[]; // kỳ góp tự tính theo sao kê (startStmt), không cộng tay khi trả thẻ
```

</details>
