Вирусные видеоролики-скелеты с помощью искусственного интеллекта.
________________________________________
PROMPT 1:
You are writing narration for a viral YouTube Shorts channel that explains human limits and biological failure.
REFERENCE STYLE (STRICT):
•	Calm
•	Clinical but conversational (NOT academic)
•	Slightly ominous
•	Second-person (“you”)
•	Short sentences
•	Simple language
•	Everyday comparisons
•	No advice, no warnings, no disclaimers
----------------------------------
ABSOLUTE LANGUAGE RESTRICTIONS
----------------------------------
•	You are NOT allowed to:
•	Use medical jargon
•	Name diseases or diagnoses
•	Describe internal processes the viewer cannot feel
•	Sound like a textbook or research paper
•	Explain mechanisms in detail
Instead:
•	Describe what the person notices
•	Describe what starts failing externally
•	Use comparisons to familiar states (fatigue, intoxication, machines, loss of control)
----------------------------------
PHASE 1: IDEA GENERATION
---------------------------------
Generate 10 short-form video ideas using:
•	“How Long Can You ___?”
•	“What Happens If You ___ Every Day?”
•	“How Much ___ Is TOO Much?”
Rules:
•	Human body or brain only
•	Escalation over time
•	 Visually explainable
•	 Slightly dangerous
•	Grounded in real life
For each idea:
•	Title
•	One-sentence failure path written in simple language
Ask the user to choose ONE idea by number.
Stop.
----------------------------------
PHASE 2: SCRIPT GENERATION
----------------------------------
Write a 45–70 second script using this structure:
STRUCTURE:
•	Opening question (1 sentence)
•	Time checkpoints (Hour / Day / Week / Month / Year)
•	At each checkpoint include:
•	What you physically feel
•	What you mentally notice
•	One familiar comparison (drunk, exhausted, machine overheating, signal loss)
•	One sudden realization moment (memory gap, loss of awareness, loss of control)
•	Final irreversible failure
•	End visually and abruptly
STYLE RULES:
•	Plain language
•	No disease names
•	No lab terms
•	No abstract biology
•	Every line must be easy to imagine visually
Output ONLY the script. ABSOLUTE SCRIPT RULES: NO MUSIC. Use ONLY the language requested (no translations). The dialogue script must be followed STERNLY for the lip-sync animation.

Копируете весь промпт 1 и вставляете в чат GPT. Результат будет сценарий для генерации изображений и видео. Если вы прочитаете сценарий то поймете что это так же и озвучка вашего ролика.
PROMPT 2: Image Prompts
You are an AI video director and prompt engineer creating photorealistic, high-quality visuals for a viral short-form video.
Your task is to convert a narration script into scene-by-scene IMAGE PROMPTS and IMAGE-TO-VIDEO PROMPTS with strict visual consistency. ABSOLUTE PROMPT RULES: STERNLY FOLLOW the text for lip-sync. NO MUSIC allowed. NO independent translations; use strictly the language specified in the prompt.
----------------------------------
INPUT
----------------------------------
Video Script:
[вставить сценарий целиком созданный из промпта номер 1]
----------------------------------
ABSOLUTE VISUAL ANCHOR (NON-NEGOTIABLE)
----------------------------------
ALL scenes MUST use the SAME anatomical character design described below.
Only the POSE, BODY POSITION, and ENVIRONMENT may change.
----------------------------------
MAIN CHARACTER — HARD LOCK
---------------------------------
For EVERY scene, the character MUST be described EXACTLY as follows
(do NOT shorten, summarize, or reference indirectly):
A full-body realistic humanoid SKELETON character with a semi-transparent human-shaped outer body shell.
The character has:
•	A fully exposed skull (NO skin, NO face, NO muscles)
•	Clean, smooth, anatomically accurate skull
•	Large, round eye sockets with visible eyeballs
•	Bright yellow irises with dark pupils
•	Neutral to slightly vacant expression
•	Visible upper and lower teeth
•	Smooth cranium with no cracks, damage, decay, or horror elements
The body is a semi-transparent, glass-like human silhouette that clearly reveals the entire internal skeletal structure from head to toe.
Skeleton details:
•	Ivory / pale beige bones
•	Smooth, medical-grade surfaces
•	Accurate human proportions
•	Clearly defined rib cage, spine, pelvis, arms, hands, legs, knees, ankles, and feet
•	All joints, vertebrae, and phalanges visible and anatomically correct
No muscles.
No veins.
No organs.
No skin texture.
The style is:
•	High-end medical visualization
•	Clean, clinical, modern
•	NOT horror
•	NOT zombie
•	NOT cartoon
•	NOT decayed
----------------------------------
POSE & ACTION RULE
----------------------------------
The character’s POSE, BODY POSITION, and GESTURE MUST change per scene to match the script.
Examples:
•	Sitting on bed scrolling phone
•	Rubbing head in confusion
•	Walking slowly
•	Slumped posture
•	Dropping an object
•	Collapsing into a chair
DO NOT keep a neutral standing pose unless the script explicitly implies it.
----------------------------------
ENVIRONMENT RULE
----------------------------------
For EACH scene:
•	Infer the environment directly from the script
•	Place the skeleton character naturally inside that environment
•	Environment must be realistic and context-appropriate
Examples:
•	Bedroom → skeleton sitting or lying on bed
•	Office → skeleton at desk
•	Street → skeleton walking
•	Chair → skeleton slumped
NO fixed white background unless the script implies a studio or medical lab.
----------------------------------
CAMERA LOCK
----------------------------------
•	Medium or medium-wide shots only
•	Eye-level or chest-level camera
•	No extreme angles
•	No dramatic lens changes
•	Same framing logic across scenes
----------------------------------
LIGHTING & REALISM
---------------------------------
•	Real-world lighting matching the environment
•	Natural shadows
•	Subtle reflections on transparent body shell
•	Photorealistic cinematic realism
•	Clean medical look
•	NOT stylized
•	NOT exaggerated
----------------------------------
TASK 1: SCENE BREAKDOWN
---------------------------------
Break the script into scenes by time or event.
For each scene, specify:
•	Scene number
•	Time checkpoint
•	Environment
•	Pose / action change from previous scene
----------------------------------
TASK 2: IMAGE PROMPTS
----------------------------------
For EACH scene, generate a FULL, STANDALONE IMAGE PROMPT that includes:
1.	FULL character description (repeated verbatim)
2.	Scene-specific environment
3.	Scene-specific pose and body language
4.	Camera framing
5.	Lighting
6.	Mood
7.	Realism constraints
DO NOT say “same character”.
DO NOT shorten descriptions.
----------------------------------
TASK 3: IMAGE-TO-VIDEO PROMPTS
---------------------------------
For EACH scene, generate an image-to-video prompt describing:
•	Subtle body movement
•	Minimal natural motion
•	Environmental motion
•	Very slight camera drift only
No fast movement.
No animation feel.
Everything must feel real and continuous.
----------------------------------
OUTPUT FORMAT
----------------------------------
Scene X:
•	Time checkpoint:
•	Environment:
•	Image prompt:
•	Image-to-video prompt:
No explanations.
No commentary.
Production-ready output only.

Копируете промпт номер 2 целиком и вставляете в чат GPT. Результат будут большой промпт для генерации изображения и в конце маленький промт для оживления этого изображения.



----------------------------------
LTX-2 MODEL SPECIFIC RULES
----------------------------------
При использовании модели LTX-2 (Text-to-Video):
1.  **CHARACTER ANCHOR**: Промпт ОБЯЗАТЕЛЬНО должен начинаться с полного описания скелета (MAIN CHARACTER — HARD LOCK). Модель LTX-2 склонна генерировать людей, если описание персонажа не является приоритетным.
2.  **NO SUBTITLES / NO TEXT**: LTX-2 часто галлюцинирует текст, если видит слова сценария. В каждом промпте ОБЯЗАТЕЛЬНО указывайте в самом начале: "STRICTLY NO TEXT, NO SUBTITLES, NO CAPTIONS, NO OVERLAYS".
3.  **AUDIO NARRATION LABELING**: Чтобы модель не пыталась отобразить текст сценария на экране, перед текстом озвучки всегда добавляйте: "AUDIO NARRATION ONLY (DO NOT SHOW AS TEXT)".
4.  **ABSOLUTE NEGATIVE PROMPT**: blurry, low quality, watermark, text, subtitles, captions, human skin, face, muscles, realistic human, horror, decay.
5.  **ASPECT RATIO**: Всегда используйте соотношение сторон 9:16 (720x1280) для формата YouTube Shorts.
6.  **STRICT AUDIO & SYNC**: NO MUSIC in video prompts. AI characters must strictly follow the provided script text for lip-sync. NO independent translations; maintain the language as provided in the prompt.
