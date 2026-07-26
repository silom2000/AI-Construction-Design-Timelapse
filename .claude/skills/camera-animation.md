---
title: AI Video Camera Animation Generator
description: Создание профессиональных, модульных промптов для анимации камеры в нейросетях для генерации видео (Kling, Runway, Seedance, Higgsfield, Luma и др.) на основе стандартизированной 4-частной грамматики и 46 движений камеры с aicameramovements.com.
---

# AI Video Camera Animation Skill

Этот навык предназначен для генерации, улучшения и подбора профессиональных промптов для движения камеры в видео-нейросетях (**Kling, Runway Gen-3, Seedance, Higgsfield, Luma Dream Machine** и др.). 
База содержит 46 стандартизированных шаблонов движения камеры из каталога **AICameraMovements.com**.

---

## 1. Грамматика и правила построения промптов (Prompt Grammar & Rules)

### Модульный подход: Сигнал камеры отдельно от сцены
- **Не смешивай описание движения камеры с описанием локации или объекта.** Разделение на независимые блоки делает описание сцены и движение камеры переиспользуемыми при замене начального кадра (First Frame).
- Стандартизированный промпт анимации камеры начинается со **вводного ключевого слова** (Introductory Keyword) фильма или ракурса, за которым следуют **4 главных параметра (Anatomy of a Camera Prompt)**:

```text
[Introductory Keyword]: [Описание сцены/объекта]. Movement: [Physical path/axis]. Speed: [Pacing/acceleration]. Framing: [Lens distance/composition]. End: [Termination point & final composition].
```

### Анатомия 4 параметров:
1. **`Movement:`** Сообщает нейросети физическую траекторию, ось или вращение камеры в пространстве.
2. **`Speed:`** Указывает темп, плавность, ускорение или резкий характер движения (эквивалентный физическим линзам и стедикамам).
3. **`Framing:`** Управляет фокусным расстоянием линз, читаемостью главного субъекта, поведением горизонта и масштабом окружения во время движения.
4. **`End:`** Указывает финальную точку остановки кадра и итоговую композицию (чтобы нейросеть понимала, к какой цели привести кадр).

---

## 2. Пошаговый процесс использования навыка (Как консультировать пользователя)

Когда пользователь просит анимировать камеру для видео, генерируемого AI, пройди следующие шаги:
1. **Определение типа сцены и цели:** Уточни или предложи наиболее подходящее движение из 7 категорий ниже.
2. **Сборка промпта:** Воспользуйся одним из 46 точных шаблонов. Если в задаче уже есть описание сцены/персонажа, вставь его перед блоком параметров камеры:
   * **Пример сборки:** `"dolly in. A cyberpunk hacker standing before neon server towers. Movement: move the camera physically forward in a straight line toward the main subject. Speed: smooth controlled push. Framing: keep camera height, lens direction and subject position consistent while distance closes. End: finish in a tighter composition."`
3. **Адаптация под генератор:** Эти формулы универсализированы для работы во всех актуальных text-to-video / image-to-video нейросетях (Kling AI, Runway, Higgsfield, MiniMax, Luma, Gen-3). Предлагай как полный 4-частный вариант (для максимальной точности), так и сокращенный вариант (только introductory keyword + Movement + Speed) для моделей с ограничениями по длине токенов.

---

## 3. Полный каталог из 46 промптов для анимации камеры

### 1. Pan / Tilt (Вращение камеры на точке)
* **Static shot (Статика):**
  * Keyword: `"locked-off static shot."`
  * Prompt: `"Movement: hold one fixed camera position for the full clip. Speed: still and steady. Framing: keep the same angle, height, lens distance and composition. End: finish with the same framing and camera position."`

* **Pan right (Панорама вправо):**
  * Keyword: `"pan right."`
  * Prompt: `"Movement: rotate the camera horizontally from left to right from one fixed point. Speed: smooth constant rotation. Framing: keep the horizon level while new space enters from the right side of the frame. End: settle on a clear final composition."`

* **Pan left (Панорама влево):**
  * Keyword: `"pan left."`
  * Prompt: `"Movement: rotate the camera horizontally from right to left from one fixed point. Speed: smooth constant rotation. Framing: keep the horizon level while new space enters from the left side of the frame. End: settle on a clear final composition."`

* **Whip pan right (Резкий разворот вправо):**
  * Keyword: `"whip pan right."`
  * Prompt: `"Movement: rotate rapidly from the starting direction toward a new target on the right. Speed: fast snap with brief motion blur during the rotation. Framing: begin on one readable composition and land on a second readable target. End: settle into a sharp final frame."`

* **Whip pan left (Резкий разворот влево):**
  * Keyword: `"whip pan left."`
  * Prompt: `"Movement: rotate rapidly from the starting direction toward a new target on the left. Speed: fast snap with brief motion blur during the rotation. Framing: begin on one readable composition and land on a second readable target. End: settle into a sharp final frame."`

* **Tilt up (Наклон вверх):**
  * Keyword: `"tilt up."`
  * Prompt: `"Movement: rotate the camera upward from one fixed point. Speed: smooth constant tilt. Framing: keep the vertical subject or architecture centered as the frame travels upward. End: land on the upper target."`

* **Tilt down (Наклон вниз):**
  * Keyword: `"tilt down."`
  * Prompt: `"Movement: rotate the camera downward from one fixed point. Speed: smooth constant tilt. Framing: keep the vertical subject or architecture centered as the frame travels downward. End: land on the lower target."`

---

### 2. Zoom / Lens (Определение резкости и фокусного расстояния)
* **Slow zoom in (Плавный зум вперед):**
  * Keyword: `"slow zoom in."`
  * Prompt: `"Movement: slowly increase lens focal length toward a tighter frame. Speed: gradual and even. Framing: keep the main visual target readable as it becomes larger in frame. End: finish on a stable tighter composition."`

* **Slow zoom out (Плавный зум назад):**
  * Keyword: `"slow zoom out."`
  * Prompt: `"Movement: slowly decrease lens focal length toward a wider frame. Speed: gradual and even. Framing: keep the main visual target readable as more surrounding space appears. End: finish on a stable wider composition."`

* **Fast zoom in (Быстрый зум вперед):**
  * Keyword: `"fast zoom in."`
  * Prompt: `"Movement: quickly increase lens focal length toward the main visual target. Speed: quick decisive zoom. Framing: keep the target centered or clearly readable during the scale change. End: finish on a stable tighter composition."`

* **Fast zoom out (Быстрый зум назад):**
  * Keyword: `"fast zoom out."`
  * Prompt: `"Movement: quickly decrease lens focal length away from the main visual target. Speed: quick decisive zoom. Framing: keep the target readable as the surrounding space appears. End: finish on a stable wider composition."`

* **Crash zoom in (Ударный зум вперед / Наезд):**
  * Keyword: `"crash zoom in."`
  * Prompt: `"Movement: snap the lens rapidly toward the main visual target. Speed: very fast and punchy. Framing: keep the target readable through the sudden scale change. End: land on a bold tighter composition."`

* **Crash zoom out (Ударный зум назад):**
  * Keyword: `"crash zoom out."`
  * Prompt: `"Movement: snap the lens rapidly away from the main visual target. Speed: very fast and punchy. Framing: keep the target readable as the surrounding space appears. End: land on a bold wider composition."`

---

### 3. Dolly / Track (Физическое движение камеры и сопровождение)
* **Dolly in (Физический налет камеры вперед):**
  * Keyword: `"dolly in."`
  * Prompt: `"Movement: move the camera physically forward in a straight line toward the main subject. Speed: smooth controlled push. Framing: keep camera height, lens direction and subject position consistent while distance closes. End: finish in a tighter composition."`

* **Dolly out (Физический отлет камеры назад):**
  * Keyword: `"dolly out."`
  * Prompt: `"Movement: move the camera physically backward in a straight line away from the main subject. Speed: smooth controlled retreat. Framing: keep lens direction and camera height consistent while more environment enters frame. End: finish in a wider composition."`

* **Tracking shot (Трекинг объекта / Сопровождение):**
  * Keyword: `"tracking shot."`
  * Prompt: `"Movement: move through the scene with the main subject. Speed: match the subject's pace. Framing: keep the subject consistently readable while the environment moves around them. End: maintain a clear moving composition."`

* **Follow shot / Over-the-shoulder (Следование сзади или из-за плеча):**
  * Keyword: `"follow shot from behind."`
  * Prompt: `"Movement: move behind the subject along their route at shoulder height. Speed: match the subject's pace. Framing: keep the back, shoulder or head as the foreground guide while the route ahead stays readable. End: continue following with the subject leading the frame."`

* **Reverse tracking / Walk-and-talk (Обратный трекинг прямо на лицо):**
  * Keyword: `"reverse tracking shot."`
  * Prompt: `"Movement: move backward in front of the walking subject. Speed: match the subject's forward pace. Framing: keep front-facing face and body framing stable as the background moves behind them. End: hold a clear front-facing moving composition."`

* **Side tracking (Боковой трекинг параллельно):**
  * Keyword: `"side tracking shot."`
  * Prompt: `"Movement: move parallel beside the subject along their direction of travel. Speed: match the subject's motion. Framing: keep the subject in side profile or three-quarter profile at a stable distance. End: continue the parallel movement with clear horizontal motion."`

* **Low tracking (Низкий трекинг у земли):**
  * Keyword: `"low tracking shot."`
  * Prompt: `"Movement: move at ground or below-waist height alongside the subject's movement path. Speed: match the subject, footsteps or wheels. Framing: keep the low detail readable while the ground plane moves through frame. End: finish with the low perspective clearly maintained."`

* **Vehicle tracking (Трекинг за транспортным средством):**
  * Keyword: `"vehicle tracking shot."`
  * Prompt: `"Movement: move with the vehicle along its route. Speed: match the vehicle's pace. Framing: keep the vehicle stable in frame while the road or environment moves past. End: maintain a clear moving vehicle composition."`

* **Chase shot (Динамичный кадр погони):**
  * Keyword: `"chase shot."`
  * Prompt: `"Movement: follow a moving subject quickly along the action route. Speed: fast, reactive and physically close. Framing: keep the subject visible while allowing energetic reframing. End: stay connected to the subject in motion."`

---

### 4. Physical Moves (Физические перемещения: слайдер, тележка, орбиты)
* **Truck right (Физический проезд вправо):**
  * Keyword: `"truck right."`
  * Prompt: `"Movement: move the camera physically to the right on a straight horizontal path. Speed: smooth constant lateral travel. Framing: keep the lens facing the same direction while the scene slides across frame. End: finish on a clean lateral composition."`

* **Truck left (Физический проезд влево):**
  * Keyword: `"truck left."`
  * Prompt: `"Movement: move the camera physically to the left on a straight horizontal path. Speed: smooth constant lateral travel. Framing: keep the lens facing the same direction while the scene slides across frame. End: finish on a clean lateral composition."`

* **Pedestal up (Вертикальный подъём корпуса камеры):**
  * Keyword: `"pedestal up."`
  * Prompt: `"Movement: move the entire camera vertically upward in a straight line. Speed: smooth constant lift. Framing: keep the lens level and pointed in the same direction during the vertical move. End: finish with the higher framing clearly readable."`

* **Pedestal down (Вертикальное опускание корпуса камеры):**
  * Keyword: `"pedestal down."`
  * Prompt: `"Movement: move the entire camera vertically downward in a straight line. Speed: smooth constant descent. Framing: keep the lens level and pointed in the same direction during the vertical move. End: finish with the lower framing clearly readable."`

* **Slider right (Короткий сдвиг на слайдере вправо с параллаксом):**
  * Keyword: `"slider right."`
  * Prompt: `"Movement: slide the camera a small distance to the right. Speed: slow controlled constant motion. Framing: keep foreground, subject and background layers readable as parallax shifts. End: finish on a refined composition with the new right-side angle visible."`

* **Slider left (Короткий сдвиг на слайдере влево с параллаксом):**
  * Keyword: `"slider left."`
  * Prompt: `"Movement: slide the camera a small distance to the left. Speed: slow controlled constant motion. Framing: keep foreground, subject and background layers readable as parallax shifts. End: finish on a refined composition with the new left-side angle visible."`

* **Push past / Pass-by shot (Пролет мимо переднего плана):**
  * Keyword: `"push past."`
  * Prompt: `"Movement: move forward past a visible foreground object, edge or opening. Speed: smooth forward glide. Framing: let the foreground pass close to the lens while the space beyond becomes clearer. End: arrive inside or beyond the foreground layer."`

* **Arc right (Облет по дуге вправо):**
  * Keyword: `"arc right."`
  * Prompt: `"Movement: move on a shallow curved path around the main subject toward the right side. Speed: smooth measured curve. Framing: keep distance, height and subject readability consistent while the angle changes. End: finish from a new right-side angle."`

* **Arc left (Облет по дуге влево):**
  * Keyword: `"arc left."`
  * Prompt: `"Movement: move on a shallow curved path around the main subject toward the left side. Speed: smooth measured curve. Framing: keep distance, height and subject readability consistent while the angle changes. End: finish from a new left-side angle."`

* **Orbit clockwise (Орбитальное вращение по часовой стрелке):**
  * Keyword: `"clockwise orbit."`
  * Prompt: `"Movement: circle clockwise around the main subject at a consistent radius. Speed: smooth controlled orbit. Framing: keep the subject centered while the background rotates around them. End: complete the intended arc or full circle with stable framing."`

* **Orbit counterclockwise (Орбитальное вращение против часовой стрелки):**
  * Keyword: `"counterclockwise orbit."`
  * Prompt: `"Movement: circle counterclockwise around the main subject at a consistent radius. Speed: smooth controlled orbit. Framing: keep the subject centered while the background rotates around them. End: complete the intended arc or full circle with stable framing."`

---

### 5. Human Camera (Органичная съёмочная камера)
* **Handheld shot (Ручная камера / Живой фокус):**
  * Keyword: `"handheld shot."`
  * Prompt: `"Movement: hold the camera at human operator height with natural body movement. Speed: responsive and organic. Framing: keep the subject readable while the frame has subtle sway and micro-adjustments. End: finish with a natural handheld composition."`

* **Body-mounted camera / Snorricam (Вид со Сноррикам на груди/цели):**
  * Keyword: `"body-mounted Snorricam."`
  * Prompt: `"Movement: keep the camera fixed relative to the subject's torso or face while the subject moves. Speed: match the subject's body motion. Framing: keep the subject close, centered and facing the camera as the background moves around them. End: finish with the subject still locked in frame."`

---

### 6. Drone / Crane (Съемки с крана и дрона)
* **Crane up (Взлёт на операторском кране вверх):**
  * Keyword: `"crane up."`
  * Prompt: `"Movement: travel smoothly upward through open space. Speed: slow controlled vertical lift. Framing: keep the subject or location readable as the camera rises. End: finish with the higher scale clearly visible."`

* **Crane down (Спуск на операторском кране вниз):**
  * Keyword: `"crane down."`
  * Prompt: `"Movement: travel smoothly downward through open space. Speed: slow controlled vertical descent. Framing: keep the subject or location readable as the camera descends. End: finish with the lower subject or destination clearly visible."`

* **Drone push in (Подлет дрона вперед):**
  * Keyword: `"drone push in."`
  * Prompt: `"Movement: fly smoothly forward through open space toward the subject or destination. Speed: controlled aerial glide. Framing: keep the route and destination readable as the camera approaches. End: arrive at a closer aerial composition."`

* **Drone pull back (Отлет дрона назад):**
  * Keyword: `"drone pull back."`
  * Prompt: `"Movement: fly smoothly backward away from the subject or destination. Speed: controlled aerial retreat. Framing: keep the subject readable as more landscape appears. End: finish on a wider aerial composition."`

* **Helicopter shot (Высотный вертолетный облёт):**
  * Keyword: `"helicopter-style aerial shot."`
  * Prompt: `"Movement: move from high altitude along a broad gradual flight path. Speed: steady controlled aerial motion. Framing: keep the landscape or distant moving subject readable at wide scale. End: finish on a stable high-altitude composition."`

---

### 7. Specials (Спецэффекты и нестандартные ракурсы)
* **First-person view / FPV (Наследующий вид от первого лица):**
  * Keyword: `"first-person view."`
  * Prompt: `"Movement: move forward at human eye height from the character's perspective. Speed: natural walking or reaching pace. Framing: use visible hands, arms or body edges as the viewer's physical reference. End: arrive at the next point of action from the same point of view."`

* **Tilt-shift (Эффект миниатюры Tilt-shift):**
  * Keyword: `"tilt-shift miniature view."`
  * Prompt: `"Movement: hold or glide from a high angled view over the scene. Speed: small precise movement. Framing: keep a narrow band of sharp focus across the key subject area with soft blur above and below. End: finish with the miniature-scale view intact."`

* **Infinite zoom (Бесконечный зум с переходом сквозь объекты):**
  * Keyword: `"infinite zoom."`
  * Prompt: `"Movement: zoom continuously inward toward the exact center target. Speed: smooth accelerating zoom. Framing: keep the circular target centered as it expands. End: finish when the next visual world fills the frame."`

* **Earth zoom out (Космический отлет от земли до масштаба планеты):**
  * Keyword: `"earth zoom out."`
  * Prompt: `"Movement: pull upward from the starting point through street, city, landscape and planet scale. Speed: rapid expanding zoom out. Framing: keep the original location centered as scale grows. End: finish on a planet-scale view with the starting point still implied at center."`

* **Time-lapse (Таймлапс при неподвижной камере):**
  * Keyword: `"locked-camera time-lapse."`
  * Prompt: `"Movement: hold one fixed camera position while time moves rapidly forward. Speed: fast time compression with a stable camera. Framing: keep the same composition and horizon as motion passes through the frame. End: finish from the same camera angle with visible passage of time."`

* **Pass-through objects (Пролет сквозь физические препятствия/окна):**
  * Keyword: `"pass-through movement."`
  * Prompt: `"Movement: move forward toward a visible object, surface or barrier and continue into the space beyond. Speed: smooth centered glide. Framing: keep the opening or surface centered as the transition point. End: arrive inside the revealed space beyond."`

---

## 4. Пример комбинирования и финального вывода

Если тебе нужно помочь пользователю составить классный промпт для **Luma / Kling / Gen-3**, предложи конструкцию в таком формате:

**[Технический вводный блок камеры] + [Описание визуального содержания] + [Модули Movement / Speed / Framing / End]**

> **Готовый пример для пролета сквозь стекло к персонажу:**
> `"pass-through movement. A cozy vintage cafe illuminated by warm raindrops on the glass against an autumn street. A tired detective drinking coffee. Movement: move forward toward a visible object, surface or barrier and continue into the space beyond. Speed: smooth centered glide. Framing: keep the opening or surface centered as the transition point. End: arrive inside the revealed space beyond."`
