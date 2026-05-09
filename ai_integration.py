"""
Модуль интеграции с AI сервисами для генерации контента
"""

import os
from typing import Optional, List
import json

# Загружаем переменные окружения из .env файла, если он существует
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    # python-dotenv не установлен, используем системные переменные окружения
    pass


class AIIntegration:
    """Класс для работы с AI сервисами"""
    
    # Доступные провайдеры AI
    PROVIDERS = {
        "Antigravity": "antigravity",
        "Mimo":        "mimo",
        "NVIDIA NIM":  "nvidia",
    }
    # Модели Mimo
    MIMO_MODELS = {
        "antigravity": "gemini-3.1-pro-high",
        "mimo":        "mimo-v2-pro",
    }

    # Все доступные модели Antigravity
    ANTIGRAVITY_MODELS = [
        "gemini-2.5-pro",
        "gemini-3.1-pro-high",
        "gemini-3-pro-high",
        "gemini-3.1-pro-high",
        "gemini-2.5-flash-thinking",
        "gemini-2.5-flash",
        "gemini-3.1-flash-lite",
        "gemini-3-pro-low",
        "gemini-3.1-pro-low",
        "gemini-2.5-flash-lite",
        "gemini-3-flash",
        "gemini-3-flash-agent",
        "gpt-oss-120b-medium",
        "claude-opus-4-6-thinking",
        "claude-sonnet-4-6",
    ]

    # Модели по умолчанию для каждой задачи
    DEFAULT_TEXT_MODEL         = "gemini-3.1-pro-high"         # Генерация текста историй
    DEFAULT_PROMPT_MODEL       = "gemini-3.1-pro-high"  # Генерация промптов картинок
    DEFAULT_VIDEO_PROMPT_MODEL = "gemini-3.1-pro-high"     # Генерация промптов для видео

    def __init__(self):
        self.openai_api_key = os.getenv("OPENAI_API_KEY", "")
        self.use_openai = True  # Always true for g4f

        # Активный провайдер ("antigravity" | "mimo")
        self.ai_provider = "antigravity"

        # Активные модели для каждой задачи (можно менять из GUI)
        self.text_model         = self.DEFAULT_TEXT_MODEL
        self.prompt_model       = self.DEFAULT_PROMPT_MODEL
        self.video_prompt_model = self.DEFAULT_VIDEO_PROMPT_MODEL

        # Set Hugging Face token for g4f providers
        from config import HF_TOKEN
        if HF_TOKEN:
            os.environ["HF_TOKEN"] = HF_TOKEN
            os.environ["HUGGINGFACEHUB_API_TOKEN"] = HF_TOKEN

    def set_provider(self, provider_key: str):
        """Установить активного AI провайдера ('antigravity' | 'mimo')"""
        if provider_key in ("antigravity", "mimo"):
            self.ai_provider = provider_key
            print(f"[AI] Провайдер переключён на: {provider_key}")

    def set_models(self, text_model: str = None, prompt_model: str = None,
                   video_prompt_model: str = None):
        """
        Установить модели для конкретных задач.

        Args:
            text_model:         Модель для генерации текста историй
            prompt_model:       Модель для генерации промптов изображений
            video_prompt_model: Модель для генерации промптов видео
        """
        if text_model:
            self.text_model = text_model
            print(f"[AI] Модель текста: {text_model}")
        if prompt_model:
            self.prompt_model = prompt_model
            print(f"[AI] Модель промптов: {prompt_model}")
        if video_prompt_model:
            self.video_prompt_model = video_prompt_model
            print(f"[AI] Модель видео-промптов: {video_prompt_model}")
    
    def chat_complete(self, messages: List[dict], model: str = "gemini-3.1-pro-high") -> str:
        """
        Выполнение чат-запроса к AI (для чат-бота)
        """
        response = self._call_ai(messages, model)
        if response:
            return response
        raise Exception("Не удалось получить ответ от AI сервисов")

    def generate_text(self, topic: str, language: str, text_style: str = "",
                     text_rules: str = "", sections: str = "", structure: str = "", 
                     word_count: int = 1000, log_callback=None) -> str:
        """
        Генерация текста для видео через AI
        """
        prompt = self._build_text_prompt(topic, language, text_style, text_rules, sections, structure, word_count)

        def log(msg):
            if log_callback:
                log_callback(msg)
            print(msg)

        # 1. Используем текущего провайдера (выбранного пользователем в GUI)
        provider = self.ai_provider  # "antigravity" | "mimo" | "nvidia"
        if provider == "mimo":
            provider_name = "Mimo"
        elif provider == "nvidia":
            provider_name = "NVIDIA NIM"
        else:
            provider_name = "Antigravity"
            
        log(f"Попытка генерации через {provider_name}...")
        ai_text = self._generate_with_antigravity(prompt, language, text_style)
        if ai_text:
            ai_text = self._clean_ai_response(ai_text)
            log(f"✅ {provider_name} успешно сгенерировал текст")
            log(f"📊 Длина сгенерированного текста: {len(ai_text)} символов")

            if not self._is_text_complete(ai_text):
                log("⚠️ Текст не завершен полным предложением. Запускаю автодописывание...")
                ai_text = self._complete_truncated_text(ai_text, language, log_callback)

            return ai_text

        log(f"❌ {provider_name} не вернул результат. Пробуем альтернативные провайдеры (g4f)...")
            
        # 2. Try g4f (Free Providers) - FALLBACK
        if not self.use_openai:
            log("Альтернативные провайдеры отключены.")
            return self._generate_text_fallback(topic, language, text_style, text_rules, sections, structure)
        
        try:
            from g4f.client import Client
            from core.text_styles import TEXT_STYLES
            
            client = Client()
            models = ["gpt-4o", "chatgpt-4o-latest", "gpt-4o-mini", "llama-3.1-70b", "gpt-3.5-turbo", "blackbox"]
            
            # Use specialized style if available
            system_msg = f"Ты — выдающийся писатель и мастер слова. Создавай яркие, образные и литературные тексты. Используй богатый словарный запас, метафоры и живописные описания. Пиши на языке: {language}"
            if text_style in TEXT_STYLES and TEXT_STYLES[text_style]:
                system_msg = TEXT_STYLES[text_style]
                # Note: The system prompt might be in English, but the user expects output in {language}
                if language != "English":
                    system_msg += f"\n\nIMPORTANT: Write the story in {language}."

            for model in models:
                log(f"Пробуем g4f модель: {model}...")
                try:
                    response = client.chat.completions.create(
                        model=model,
                        messages=[
                            {"role": "system", "content": system_msg},
                            {"role": "user", "content": prompt}
                        ],
                        max_tokens=4000,
                        temperature=0.85
                    )
                    if response.choices and response.choices[0].message.content:
                        text = response.choices[0].message.content.strip()
                        text = self._clean_ai_response(text)
                        
                        if text and len(text) > 50:
                            log(f"✅ g4f ({model}) успешно сгенерировал текст")
                            log(f"📊 Длина сгенерированного текста: {len(text)} символов")
                            
                            if not self._is_text_complete(text):
                                log("⚠️ Текст не завершен полным предложением. Запускаю автодописывание...")
                                text = self._complete_truncated_text(text, language, log_callback)
                            
                            return text
                        else:
                            log(f"⚠️ g4f ({model}) вернул пустой или слишком короткий текст")
                except Exception as e:
                    log(f"⚠️ Ошибка g4f модели {model}: {e}")
                    continue
            
            log("❌ Все модели g4f не смогли сгенерировать текст.")
            return self._generate_text_fallback(topic, language, text_style, text_rules, sections, structure)
            
        except Exception as e:
            log(f"❌ Критическая ошибка g4f: {e}")
            return self._generate_text_fallback(topic, language, text_style, text_rules, sections, structure)

    def _clean_ai_response(self, text: str) -> str:
        """
        Очистка ответа AI от рекламы и спама
        
        Args:
            text: Текст для очистки
            
        Returns:
            Очищенный текст
        """
        if not text:
            return text
        
        # Список спам-фраз для удаления
        spam_patterns = [
            "Want best roleplay experience?",
            "https://llmplayground.net",
            "llmplayground.net",
            "Visit our website",
            "Check out our",
            "For more information visit",
            "Learn more at"
        ]
        
        # Удаляем спам-фразы
        cleaned_text = text
        for pattern in spam_patterns:
            if pattern in cleaned_text:
                # Удаляем строку со спамом
                lines = cleaned_text.split('\n')
                cleaned_lines = [line for line in lines if pattern.lower() not in line.lower()]
                cleaned_text = '\n'.join(cleaned_lines)
        
        # Удаляем лишние пустые строки
        while '\n\n\n' in cleaned_text:
            cleaned_text = cleaned_text.replace('\n\n\n', '\n\n')
        
        return cleaned_text.strip()

    def _is_text_complete(self, text: str) -> bool:
        """
        Проверка, завершен ли текст полным предложением
        
        Args:
            text: Текст для проверки
            
        Returns:
            True если текст завершен, False если оборван
        """
        if not text:
            return False
            
        # Убираем пробелы в конце
        text = text.rstrip()
        
        # Проверяем, заканчивается ли текст знаком препинания
        sentence_endings = ['.', '!', '?', '。', '！', '？']  # Включая китайские знаки
        
        if not any(text.endswith(ending) for ending in sentence_endings):
            return False
            
        # Дополнительная проверка: последнее слово не должно быть обрезано
        # Если последние символы - это буквы без знака препинания, текст оборван
        last_chars = text[-20:] if len(text) > 20 else text
        
        # Проверяем, есть ли незавершенное слово в конце
        import re
        # Ищем паттерн: буквы без знака препинания в самом конце
        if re.search(r'[а-яА-ЯёЁa-zA-Z]{3,}$', text):
            return False
            
        return True

    def _complete_truncated_text(self, truncated_text: str, language: str, log_callback=None) -> str:
        """
        Дописывание оборванного текста
        
        Args:
            truncated_text: Оборванный текст
            language: Язык текста
            log_callback: Функция для логирования
            
        Returns:
            Дописанный текст
        """
        def log(msg):
            if log_callback:
                log_callback(msg)
            print(msg)
        
        log("⚠️ Обнаружен оборванный текст. Пытаюсь дописать...")
        
        # Берем последние 500 символов для контекста
        context = truncated_text[-500:] if len(truncated_text) > 500 else truncated_text
        
        # Создаем промпт для дописывания
        prompt = f"""Продолжи и ЗАВЕРШАЙ следующий текст. Текст оборван на середине предложения.

ВАЖНО:
- Допиши ТОЛЬКО недостающую часть текущего предложения
- Затем добавь 1-2 заключительных предложения для логического завершения
- НЕ начинай новую тему, только завершай текущую мысль
- Текст должен заканчиваться точкой

Язык: {language}

Оборванный текст:
...{context}

Допиши ТОЛЬКО продолжение (без повторения того, что уже есть):"""

        messages = [
            {"role": "system", "content": f"Ты — редактор текстов. Твоя задача — дописать оборванный текст и завершить его. Пиши на языке: {language}"},
            {"role": "user", "content": prompt}
        ]
        
        # Пробуем через Antigravity (основной)
        try:
            completion = self._call_ai(messages)
            if completion:
                completion = completion.strip()
                if completion and len(completion) > 10:
                    log(f"✅ Текст дописан через Antigravity (+{len(completion)} символов)")
                    return truncated_text + " " + completion
        except Exception as e:
            log(f"⚠️ Ошибка при дописывании через Antigravity: {e}")


        
        # Пробуем через g4f
        try:
            from g4f.client import Client
            client = Client()
            
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=messages,
                max_tokens=500,  # Небольшой лимит, только для завершения
                temperature=0.7
            )
            
            if response.choices and response.choices[0].message.content:
                completion = response.choices[0].message.content.strip()
                if completion and len(completion) > 10:
                    log(f"✅ Текст дописан через g4f (+{len(completion)} символов)")
                    return truncated_text + " " + completion
        except Exception as e:
            log(f"⚠️ Ошибка при дописывании через g4f: {e}")
        
        # Если не удалось дописать, возвращаем как есть с точкой
        log("⚠️ Не удалось дописать текст автоматически. Добавляю точку.")
        return truncated_text.rstrip() + "."


    def _call_antigravity_api(self, messages: List[dict], model: str = "gemini-3.1-pro-high") -> Optional[str]:
        """Интеграция с Antigravity AI с механизмом повторных попыток"""
        import time
        import requests
        
        max_retries = 3
        retry_delay = 1
        timeout = 180

        for attempt in range(max_retries):
            try:
                from config import ANTIGRAVITY_API_KEY, ANTIGRAVITY_API_BASE
                if not ANTIGRAVITY_API_KEY:
                    print("[ERROR] ANTIGRAVITY_API_KEY не найден в конфигурации")
                    return None
                    
                invoke_url = f"{ANTIGRAVITY_API_BASE.rstrip('/')}/chat/completions"
                headers = {
                    "Authorization": f"Bearer {ANTIGRAVITY_API_KEY}",
                    "Content-Type": "application/json"
                }
                payload = {
                    "model": model,
                    "messages": messages,
                    "max_tokens": 16384,
                    "temperature": 1.00,
                    "top_p": 1.00,
                    "stream": False
                }
                
                if attempt > 0:
                    print(f"[INFO] Попытка {attempt+1}/{max_retries} → Antigravity ({model})...")
                else:
                    print(f"[INFO] Requesting AI text from Antigravity (Model: {model})...")
                    
                response = requests.post(invoke_url, headers=headers, json=payload, timeout=timeout)
                
                if response.status_code == 200:
                    data = response.json()
                    if "choices" in data and len(data["choices"]) > 0:
                        content = data["choices"][0]["message"].get("content", "")
                        if content and content.strip():
                            print(f"[SUCCESS] Antigravity response received ({len(content)} chars)")
                            return content.strip()
                
                print(f"[ERROR] Antigravity API error: {response.status_code} - {response.text}")
                if attempt < max_retries - 1:
                    time.sleep(retry_delay)
                    
            except Exception as e:
                print(f"[ERROR] Attempt {attempt+1} failed in _call_antigravity_api: {e}")
                if attempt < max_retries - 1:
                    time.sleep(retry_delay)
                    
        print("[ERROR] Все попытки запроса к Antigravity исчерпаны")
        return None

    def _call_mimo_api(self, messages: List[dict], model: str = "mimo-v2-pro") -> Optional[str]:
        """Интеграция с Mimo AI (api.xiaomimimo.com)"""
        import time
        import requests

        max_retries = 3
        retry_delay = 1
        timeout = 120

        for attempt in range(max_retries):
            try:
                from config import MIMO_API_KEY, MIMO_API_BASE
                if not MIMO_API_KEY:
                    print("[ERROR] MIMO_API_KEY не найден в конфигурации")
                    return None

                invoke_url = f"{MIMO_API_BASE.rstrip('/')}/chat/completions"
                headers = {
                    "api-key": MIMO_API_KEY,
                    "Content-Type": "application/json"
                }
                payload = {
                    "model": model,
                    "messages": messages,
                }

                if attempt > 0:
                    print(f"[INFO] Попытка {attempt+1}/{max_retries} → Mimo ({model})...")
                else:
                    print(f"[INFO] Requesting AI text from Mimo (Model: {model})...")

                response = requests.post(invoke_url, headers=headers, json=payload, timeout=timeout)

                if response.status_code == 200:
                    data = response.json()
                    if "choices" in data and len(data["choices"]) > 0:
                        content = data["choices"][0]["message"].get("content", "")
                        if content and content.strip():
                            print(f"[SUCCESS] Mimo response received ({len(content)} chars)")
                            return content.strip()

                print(f"[ERROR] Mimo API error: {response.status_code} - {response.text}")
                if attempt < max_retries - 1:
                    time.sleep(retry_delay)

            except Exception as e:
                print(f"[ERROR] Attempt {attempt+1} failed in _call_mimo_api: {e}")
                if attempt < max_retries - 1:
                    time.sleep(retry_delay)

        print("[ERROR] Все попытки запроса к Mimo исчерпаны")
        return None


    def _call_nvidia_api(self, messages: list, model: str = "qwen/qwen3.5-397b-a17b") -> str:
        """
        Вызов NVIDIA NIM API (qwen3.5-397b и другие модели).
        Использует streaming и возвращает чистый текст ответа.
        """
        import requests as _req
        import os as _os

        api_key  = _os.getenv("NVIDIA_API_KEY", "")
        base_url = _os.getenv("NVIDIA_API_BASE", "https://integrate.api.nvidia.com/v1")

        if not api_key:
            print("[NVIDIA] ERROR: NVIDIA_API_KEY not set in .env")
            return ""

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Accept": "text/event-stream",
            "Content-Type": "application/json",
        }

        payload = {
            "model": model,
            "messages": messages,
            "max_tokens": 16384,
            "temperature": 0.60,
            "top_p": 0.95,
            "top_k": 20,
            "presence_penalty": 0,
            "repetition_penalty": 1,
            "stream": True,
        }

        print(f"[NVIDIA] Запрос к модели: {model}")
        try:
            response = _req.post(
                f"{base_url}/chat/completions",
                headers=headers,
                json=payload,
                stream=True,
                timeout=120,
            )

            if response.status_code != 200:
                print(f"[NVIDIA] HTTP {response.status_code}: {response.text[:200]}")
                return ""

            result_parts = []
            in_thinking = False

            for line in response.iter_lines():
                if not line:
                    continue
                raw = line.decode("utf-8").strip()
                if not raw.startswith("data:"):
                    continue
                raw = raw[5:].strip()
                if raw == "[DONE]":
                    break
                try:
                    import json as _json
                    chunk = _json.loads(raw)
                    delta = chunk.get("choices", [{}])[0].get("delta", {})
                    content = delta.get("content", "")

                    # Пропускаем блок <think>...</think>
                    if "<think>" in content:
                        in_thinking = True
                    if in_thinking:
                        if "</think>" in content:
                            in_thinking = False
                        continue

                    if content:
                        result_parts.append(content)
                        print(content, end="", flush=True)
                except Exception:
                    continue

            print()  # Вставка переноса строки после завершения стрима
            full_text = "".join(result_parts).strip()
            print(f"[NVIDIA] Получено символов: {len(full_text)}")
            return full_text

        except Exception as e:
            print(f"[NVIDIA] Ошибка запроса: {e}")
            return ""

    def _call_ai(self, messages: List[dict], model: str = None) -> Optional[str]:
        """
        Универсальный метод — вызывает провайдера по self.ai_provider.
        Если активный провайдер недоступен, автоматически делает fallback.
        """
        provider = self.ai_provider

        # Выбираем модель под провайдера если явно не указана
        if model is None:
            model = self.MIMO_MODELS.get(provider, "gemini-3.1-pro-high")

        if provider == "mimo":
            mimo_model = self.MIMO_MODELS.get("mimo", "mimo-v2-pro")
            result = self._call_mimo_api(messages, model=mimo_model)
            if result:
                return result
            print("[AI] Mimo недоступен, fallback -> Antigravity")
            return self._call_antigravity_api(messages, model="gemini-3.1-pro-high")

        elif provider == "nvidia":
            result = self._call_nvidia_api(messages, model=model)
            if result:
                return result
            print("[AI] NVIDIA недоступен, fallback -> Antigravity")
            return self._call_antigravity_api(messages, model="gemini-3.1-pro-high")

        else:
            result = self._call_antigravity_api(messages, model=model)
            if result:
                return result
            print("[AI] Antigravity недоступен, fallback -> Mimo")
            return self._call_mimo_api(messages, model="mimo-v2-pro")


    def describe_image(self, base64_image: str, prompt: str = "Describe this person's appearance in detail for a character consistency profile. Focus on race, ethnicity, skin tone, hair texture, facial features, and build. Be extremely specific.") -> str:
        """
        Analyze an image using Vision and return a textual description.
        
        Args:
            base64_image: Base64 encoded image (without data: prefix)
            prompt: Question or instruction for Vision analysis
            
        Returns:
            Description text or empty string on failure
        """
        # Multimodal message format for Pollinations/OpenAI standard
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{base64_image}"
                        }
                    }
                ]
            }
        ]
        
        try:
            # We use gemini-3.1-pro-high for Vision analysis via Antigravity
            description = self._call_ai(messages, model="gemini-3.1-pro-high")
            if description:
                return description.strip()
        except Exception as e:
            print(f"[ERROR] Vision analysis failed: {e}")
            
        return ""

    def _generate_with_antigravity(self, prompt: str, language: str, text_style: str = "") -> Optional[str]:
        """Генерация текста сценария через Antigravity"""
        from core.text_styles import TEXT_STYLES
        
        system_msg = f"Ты — талантливый писатель и мастер слова. Создавай яркие, образные и литературные тексты для видео на языке: {language}. Используй богатый словарный запас, метафоры и живописные описания. Следуй структуре и правилам."
        
        if text_style in TEXT_STYLES and TEXT_STYLES[text_style]:
            system_msg = TEXT_STYLES[text_style]
            if language != "Russian":
                 system_msg += f"\n\nIMPORTANT: Write the story in {language}."
        
        messages = [
            {"role": "system", "content": system_msg},
            {"role": "user", "content": prompt}
        ]
        
        if self.ai_provider == "mimo":
            provider_name = "Mimo"
            model_to_use = "mimo-v2-pro"
        elif self.ai_provider == "nvidia":
            provider_name = "NVIDIA NIM"
            model_to_use = self.text_model
        else:
            provider_name = "Antigravity"
            model_to_use = self.text_model
            
        print(f"[INFO] Попытка генерации через {provider_name} (model={model_to_use})...")
        return self._call_ai(messages, model=model_to_use)
    
    def _build_text_prompt(self, topic: str, language: str, text_style: str,
                          text_rules: str, sections: str, structure: str, word_count: int = 1000) -> str:
        """Построение промпта для генерации текста"""
        prompt_parts = [f"Создай подробный и увлекательный сценарий для видео-ролика на тему: {topic}"]
        
        # Определяем язык для промпта
        lang_instruction = {
            "Russian": "Пиши на русском языке.",
            "English": "Write in English.",
            "Spanish": "Escribe en español.",
            "French": "Écris en français.",
            "German": "Schreibe auf Deutsch.",
            "Chinese": "用中文写作。"
        }.get(language, f"Write in {language}.")
        
        prompt_parts.append(lang_instruction)
        
        if text_style:
            prompt_parts.append(f"\nСтиль текста: {text_style}")
        
        if text_rules:
            prompt_parts.append(f"\nПравила текста, которые нужно соблюдать:\n{text_rules}")
        
        if structure:
            prompt_parts.append(f"\nСтруктура должна включать следующие разделы:\n{structure}")
            prompt_parts.append("\nРаскрой каждый раздел подробно, создавая связный и интересный рассказ.")
        elif sections:
            prompt_parts.append(f"\nСоздай текст из {sections} логически связанных разделов.")
        
        min_words = int(word_count * 0.95)
        max_words = int(word_count * 1.05)
        prompt_parts.append("📏 СТРОГИЕ МАТЕМАТИЧЕСКИЕ ТРЕБОВАНИЯ К ОБЪЕМУ (КРИТИЧЕСКИ ВАЖНО):")
        prompt_parts.append(f"1. Твоя целевая длина: РОВНО {word_count} слов.")
        prompt_parts.append(f"2. ЖЕСТКИЙ ЛИМИТ: Текст должен содержать СТРОГО от {min_words} до {max_words} слов.")
        prompt_parts.append(f"3. Текст короче {min_words} слов будет ОТКЛОНЕН системой как грубая ошибка.")
        prompt_parts.append(f"4. Если сюжет заканчивается, а нужный объем ({word_count} слов) не достигнут, ты ОБЯЗАН внедрить новые микро-сюжеты, раскрыть подтексты, добавить глубокие диалоги и кинематографичные описания окружения.")
        prompt_parts.append("5. Ты должен внутренне подсчитывать слова по мере генерации и подстраивать темп повествования, чтобы финал наступил строго в рамках заданного объема.")
        # prompt_parts.append(f"- Пожалуйста, распредели объем равномерно по всему сценарию.")
        prompt_parts.append("- Каждый подпункт или этап должен быть подробно описан")
        
        prompt_parts.append("\nТребования к тексту:")
        prompt_parts.append("- Текст должен быть информативным и увлекательным")
        prompt_parts.append("- Используй живые примеры и интересные факты")
        prompt_parts.append("- Пиши простым и понятным языком")
        prompt_parts.append("- Создай плавные переходы между разделами")
        prompt_parts.append("- Текст должен быть готов для озвучки (естественные предложения)")
        prompt_parts.append("- ВАЖНО: НЕ пиши названия разделов и заголовки (например 'Введение', 'Заключение'). Пиши только сплошной текст озвучки.")
        prompt_parts.append("- Не используй маркеры списков или нумерацию, если это не перечисление внутри предложения.")
        prompt_parts.append("- ВАЖНО: Все числительные и цифры пиши СЛОВАМИ. Пример: '20 век' -> 'двадцатый век', '5 машин' -> 'пять машин', 'V' -> 'пять'.")
        prompt_parts.append("\n⚠️ КРИТИЧЕСКИ ВАЖНО:")
        prompt_parts.append("- ПОВЕСТВОВАНИЕ: Рассказывай ИСТОРИЮ, а не пиши общие рассуждения. Если в теме указаны этапы (например, детский сад, школа) — обязательно опиши каждый из них последовательно.")
        prompt_parts.append("- ПОЛНОТА: Каждому событию удели минимум 2-3 абзаца подробностей.")
        prompt_parts.append("- ОБЯЗАТЕЛЬНО завершай текст полным предложением с точкой")
        prompt_parts.append("- НЕ обрывай текст на середине предложения или мысли")
        prompt_parts.append("- Последнее предложение должно быть логическим завершением всего текста")
        prompt_parts.append("\n🚫 ЗАПРЕЩЕНО:")
        prompt_parts.append("- НЕ добавляй рекламу, ссылки или промо-материалы")
        prompt_parts.append("- НЕ пиши 'Want best roleplay experience' или подобные фразы")
        prompt_parts.append("- Пиши ТОЛЬКО контент по теме")
        
        final_prompt = "\n".join(prompt_parts)
        print(f"[AI] Сформирован промпт для текста ({len(final_prompt)} симв.)")
        return final_prompt
    
    def _generate_text_fallback(self, topic: str, language: str, text_style: str,
                               text_rules: str, sections: str, structure: str) -> str:
        """Заглушка для генерации текста без AI (упрощенная)"""
        
        # Если генерация не удалась, лучше вернуть что-то простое, чем бред
        print("⚠️ Используется Fallback генерация текста (AI недоступен)")
        
        is_ru = language == "Russian"
        
        intro_title = "Введение" if is_ru else "Introduction"
        concl_title = "Заключение" if is_ru else "Conclusion"
        
        text = f"# {topic}\n\n"
        
        # Введение
        text += f"## {intro_title}\n\n"
        text += f"Этот видеоролик посвящен теме: {topic}.\n\n" if is_ru else f"This video is about: {topic}.\n\n"
        
        # Разделы
        if structure:
            sections_list = [s.strip() for s in structure.split('\n') if s.strip()]
            for i, section in enumerate(sections_list, 1):
                text += f"\n## {section}\n\n"
                text += f"(Текст для раздела '{section}' не был сгенерирован AI. Пожалуйста, напишите его здесь...)\n\n" if is_ru else f"(Text for section '{section}' was not generated by AI. Please write it here...)\n\n"
        else:
            num = int(sections) if sections.isdigit() else 3
            for i in range(1, num + 1):
                 text += f"\n## Часть {i}\n\n" if is_ru else f"\n## Part {i}\n\n"
                 text += f"(Место для вашего текста...)\n\n" if is_ru else f"(Place for your text...)\n\n"
        
        # Заключение
        text += f"\n## {concl_title}\n\n"
        text += f"Спасибо за просмотр! Подписывайтесь на канал." if is_ru else f"Thanks for watching! Subscribe to the channel."
        
        return text
    
    
    
    def analyze_characters(self, text: str) -> str:
        """
        Глубокий анализ текста с поддержкой ДУГИ ВЗРОСЛЕНИЯ персонажа.
        Создаёт "Character Bible" — карточку персонажа с:
        - Неизменными чертами ДНК (форма ушей, губ, цвет глаз, структура лица)
        - Возрастными стадиями (детство → юность → зрелость → старость)
        - Историческим контекстом (одежда, эпоха)
        """
        print("[INFO] Analyzing characters with aging arc profiling...")

        prompt = f"""You are a professional casting director, makeup artist, and visual continuity supervisor for a biographical film.

Analyze the following script VERY carefully. The story may span the ENTIRE LIFE of a character — from birth to old age.

For EACH main character create a detailed "Character Bible" using EXACTLY this format:

═══════════════════════════════════════
CHARACTER [N]: [Full Name or Role]
═══════════════════════════════════════

## DNA TRAITS (NEVER CHANGE — present at ALL ages):
- ETHNICITY & SKIN: [race, exact skin tone — e.g. "Slavic, fair skin with light freckles"]
- EYES: [color, shape, distinctive look — e.g. "deep-set dark brown eyes, thick brows"]
- FACE STRUCTURE: [bone structure, jaw, cheekbones — e.g. "strong square jaw, high cheekbones"]
- EARS: [shape, size — e.g. "slightly protruding ears, rounded lobes"]
- LIPS: [shape, fullness — e.g. "thin upper lip, fuller lower lip, slight natural downward curve"]
- NOSE: [shape — e.g. "broad flat nose", "sharp Roman nose with slight hook"]
- HANDS: [if relevant — e.g. "large calloused hands of a craftsman"]
- DNA_SEED: [5-7 English keywords capturing permanent identity — e.g. "slavic man dark-brown-eyes square-jaw high-cheekbones fair-skin"]

## LIFE STAGES (describe appearance at each stage present in the story):

### CHILDHOOD (0-12 years) — [include ONLY if story shows this period]
- AGE_RANGE: [e.g. "5-10 years old"]
- FACE: [chubby cheeks, rounded features, baby fat — childlike proportions]
- HAIR: [original natural color, style typical for era and region]
- BUILD: [small, slim, height relative to adults]
- EXPRESSION: [curious/playful/shy etc.]
- CLOTHING: [era-appropriate children's clothing]
- STAGE_TAG: [3-4 keywords — e.g. "young boy chubby-cheeks dark-hair 1940s"]

### YOUTH (13-25 years) — [include ONLY if story shows this period]
- AGE_RANGE: [e.g. "17-22 years old"]
- FACE: [angular features emerging, acne if applicable, fresh skin, no wrinkles]
- HAIR: [full hair, original color, style for era]
- BUILD: [lean/athletic/growing, height]
- EXPRESSION: [ambitious/restless/determined etc.]
- BEARD: [none, or light stubble if culturally appropriate]
- CLOTHING: [student/apprentice/soldier clothing for era]
- STAGE_TAG: [3-4 keywords — e.g. "young man lean angular-face dark-hair 1950s"]

### PRIME (26-45 years) — [include ONLY if story shows this period]
- AGE_RANGE: [e.g. "30-40 years old"]
- FACE: [defined features, slight lines around eyes, confident look]
- HAIR: [same color or first hints of grey at temples]
- BUILD: [strong, filled out, professional posture]
- EXPRESSION: [confident/authoritative/skilled etc.]
- BEARD: [describe if present — e.g. "neat dark beard with first grey strands", or "clean-shaven"]
- CLOTHING: [professional/craft/era-appropriate attire reflecting his achievement]
- STAGE_TAG: [3-4 keywords — e.g. "middle-aged man beard grey-temples strong-build 1960s"]

### MATURITY (46-65 years) — [include ONLY if story shows this period]
- AGE_RANGE: [e.g. "50-60 years old"]
- FACE: [deeper lines, weathered skin, crow's feet, distinguished look]
- HAIR: [salt-and-pepper or mostly grey, same style tendency]
- BUILD: [stockier or lean depending on lifestyle]
- EXPRESSION: [wise/tired/proud/experienced]
- BEARD: [if present — greying beard, describe style]
- CLOTHING: [senior professional, respected community member attire]
- STAGE_TAG: [3-4 keywords — e.g. "senior man grey-beard weathered-face salt-pepper-hair 1970s"]

### OLD AGE (66+ years) — [include ONLY if story shows this period]
- AGE_RANGE: [e.g. "70-80 years old"]
- FACE: [deep wrinkles, sunken cheeks, age spots, rheumy eyes but SAME COLOR]
- HAIR: [white or fully grey, thinner, same style tendency]
- BUILD: [slightly stooped, slower movement, frail or still strong per character]
- EXPRESSION: [reflective/peaceful/frail/proud]
- BEARD: [if present — full white/grey beard or clean-shaven as per story]
- CLOTHING: [era-appropriate elder clothing]
- STAGE_TAG: [3-4 keywords — e.g. "old man white-hair deep-wrinkles frail 1990s"]

## SCENE IDENTIFICATION GUIDE:
To determine which life stage applies to a scene, look for these clues:
- Direct age mentions ("он был ребёнком", "в молодости", "уже старик")
- Historical context clues (war years, technology described, events)
- Life events (school → apprenticeship → marriage → career peak → retirement)
- Physical descriptions in the text itself

Rules:
- DNA_SEED must appear in EVERY prompt for this character at ALL ages
- Only include life stages that actually appear in the story
- Be EXTREMELY specific — vague descriptions create inconsistent characters
- If story has no specific character: write NO_CHARACTERS

Script to analyze:
{text[:6000]}

Output ONLY the Character Bibles. No intro text, no summary, no explanation."""

        messages = [
            {
                "role": "system",
                "content": (
                    "You are a world-class film continuity supervisor and biographical casting director. "
                    "Your specialty is maintaining perfect visual consistency of characters across decades "
                    "in biographical films. You understand that certain facial features (bone structure, "
                    "eye color, ear shape, lip shape) NEVER change with age, while others (hair color, "
                    "skin texture, weight, posture) change gradually. Be extremely precise and detailed."
                )
            },
            {"role": "user", "content": prompt}
        ]

        result = self._call_ai(messages, model=self.prompt_model)
        if result and "NO_CHARACTERS" not in result:
            print(f"[INFO] Character Bible extracted: {len(result)} chars")
            return result.strip()
        print("[INFO] No specific characters found.")
        return ""


    def analyze_story_setting(self, text: str) -> str:
        """
        Анализ текста на предмет исторической эпохи, окружения и условий жизни.
        Возвращает детальное описание контекста для всех сцен.
        """
        print("[INFO] Analyzing text for comprehensive story context...")
        
        prompt = (
            "Analyze the following script and extract COMPREHENSIVE CONTEXT for consistent image generation across ALL scenes.\n\n"
            "Identify and describe in detail:\n\n"
            "1. TIME PERIOD & HISTORICAL ERA:\n"
            "   - Exact time period (e.g., 'Stalinist USSR 1930s-1940s', 'Medieval Europe 1200s', 'Modern day 2020s')\n"
            "   - Technology level available in this era\n"
            "   - What did NOT exist yet (e.g., 'no modern plates, no plastic, no smartphones')\n\n"
            "2. LOCATION & ENVIRONMENT:\n"
            "   - Main setting (e.g., 'Soviet labor camp in Siberia', 'Castle dungeon', 'Corporate office')\n"
            "   - Living conditions (e.g., 'harsh, primitive barracks', 'luxurious palace', 'cramped urban apartment')\n"
            "   - Available resources and materials\n\n"
            "3. PHYSICAL CONDITIONS & STATE:\n"
            "   - Characters' physical state (e.g., 'emaciated prisoners', 'well-fed nobles', 'athletic soldiers')\n"
            "   - Clothing quality and type appropriate to era and conditions\n"
            "   - Hygiene and health level\n\n"
            "4. VISUAL ATMOSPHERE:\n"
            "   - Color palette (e.g., 'muted grays and browns', 'vibrant renaissance colors')\n"
            "   - Lighting (e.g., 'harsh winter light', 'dim candlelight', 'neon glow')\n"
            "   - Overall mood and tone\n\n"
            "5. STRICT PROHIBITIONS & ANACRONISMS (CRITICAL):\n"
            "   - Identify any modern objects or concepts described in the text as ABSENT or NEGATED (e.g., 'no money', 'world without tech').\n"
            "   - Explicitly list these as STRICTLY FORBIDDEN in the visual world.\n"
            "   - Ensure the era-appropriate alternative is described (e.g., 'use barter scenes instead of coins').\n\n"
            "Output a DETAILED paragraph (100-150 words) covering all points above.\n"
            "This context will be applied to EVERY scene, even when specific sentences don't mention these details.\n"
            "Start with 'CONTEXT: ...'\n\n"
            f"Script:\n{text[:4000]}"
        )
        
        messages = [
            {"role": "system", "content": "You are a historical accuracy consultant and creative director. Ensure absolute consistency and prevent anachronisms in visual storytelling."},
            {"role": "user", "content": prompt}
        ]
        
        try:
            context = self._call_ai(messages)
                
            if context:
                print(f"[INFO] Comprehensive Story Context Identified:\n{context}")
                return context
        except Exception as e:
            print(f"[ERROR] Context analysis failed: {e}")
            
        return ""
    
    def generate_image_prompts(self, text: str, image_style: str = "") -> List[str]:
        """
        Генерация промптов для изображений на основе текста
        Использует умное разбиение: предложения короче 7 слов объединяются.
        
        Args:
            text: Текст видео
            image_style: Стиль изображений
        
        Returns:
            Список промптов для изображений
        """
        # 1. Clean and split into sentences
        lines = text.split('\n')
        cleaned_text = ""
        for line in lines:
            if line.strip() and not line.strip().startswith('#'):
                cleaned_text += line.strip() + " "
        
        # Split by sentence endings (simple approach)
        raw_sentences = [s.strip() + "." for s in cleaned_text.replace('!', '.').replace('?', '.').split('.') if s.strip()]
        
        # 2. Smart merge logic
        merged_sentences = []
        current_chunk = ""
        MIN_WORDS = 7
        
        for sentence in raw_sentences:
            # Count words
            word_count = len(sentence.split())
            
            if not current_chunk:
                current_chunk = sentence
            else:
                # Check if we SHOULD merge
                # Merge if current chunk is too short OR if the new sentence is tiny 
                # (actually user req: "if less than 6-7 words then merge")
                
                current_chunk_len = len(current_chunk.split())
                
                if current_chunk_len < MIN_WORDS:
                    current_chunk += " " + sentence
                else:
                    # Current chunk is big enough, push it and start new
                    merged_sentences.append(current_chunk)
                    current_chunk = sentence
        
        # Append remaining
        if current_chunk:
            merged_sentences.append(current_chunk)
            
        # 3. Create prompts with Character Consistency
        prompts = []
        
        # Analyze full context ONCE for all scenes
        character_profile = self.analyze_characters(text)
        story_setting = self.analyze_story_setting(text)
        
        # Generate a fixed seed for character consistency
        import random
        character_seed = random.randint(1000, 999999)
        if character_profile:
            print(f"[INFO] Using character seed: {character_seed} for visual consistency")
        
        print(f"[INFO] Generating image prompts for {len(merged_sentences)} scenes...")
        
        for i, chunk in enumerate(merged_sentences[:25]):  # Limit to 25 scenes
            # Use AI to generate a detailed visual prompt based on the chunk AND the story context
            prompt = self.generate_prompt_for_text_chunk(chunk, image_style, 
                                                         character_profile=character_profile,
                                                         story_setting=story_setting,
                                                         character_seed=character_seed)
            prompts.append(prompt)
            print(f"  - Scene {i+1} prompt: {prompt[:50]}...")
        
        return prompts if prompts else [f"{image_style if image_style else 'Cinematic'}, scene from video"]
    
    def generate_prompt_for_text_chunk(self, text_chunk: str, image_style: str = "", 
                                       use_ai: bool = True, character_profile: str = "", 
                                       story_setting: str = "", character_seed: int = None,
                                       text_style: str = "") -> str:
        """
        Генерация промпта для изображения на основе части текста и профиля персонажа
        
        Args:
            text_chunk: Часть текста
            image_style: Стиль изображений
            character_profile: Описание внешности персонажа (для постоянства)
            story_setting: Описание эпохи и окружения (для историчности)
            character_seed: Seed для постоянства визуального стиля персонажа
            use_ai: Использовать AI для генерации промпта
            text_style: Стиль текста (может включить специфический режим генерации, например "Финансы")
        
        Returns:
            Промпт для изображения
        """
        if use_ai:
            # === SPECIAL MODE: FINANCE ===
            if text_style == "Финансы":
                user_image_style = image_style if image_style else "hand-drawn anime illustration"
                
                system_rules = f"""You are an AI assistant specialized in generating exactly ONE highly detailed image generation prompt per input for slideshow videos with voice-over narration about finance and business.
The narration might be in any language (e.g. Russian), but you MUST ALWAYS generate the prompt in ENGLISH to optimize visual quality.
You work in a clean, {user_image_style} style with MANDATORY infographic elements for all numerical and financial concepts.

🧠 CORE RULE (CRITICAL)
Each input represents exactly ONE specific visual moment.
Generate EXACTLY ONE image prompt.
Do NOT generate multiple visuals.
Do NOT create lists.
Do NOT add numbering, titles, or headings.
Do NOT repeat or summarize previous visuals.
If you violate this rule, the pipeline will break.
🧾 INPUT CONTEXT
Each input already represents:

One sentence of narration
One specific visual scale (wide / medium / close)
One exact narrative or explanatory moment

You must visualize ONLY that moment.
🖼️ IMAGE PROMPT STRUCTURE (MANDATORY)
Your output MUST strictly follow this structure, using vertical bars | as separators:

Main Character(s) or Visual Focus – {user_image_style} human characters OR infographic elements as the primary focus, detailed appearance, professional clothing, facial expression, body language, interaction with data visualizations
|
Scene & Environment – modern office, city interior, conference room, OR abstract data-space where financial concepts exist as physical structures
|
Infographic Layer (MANDATORY) – charts, graphs, percentage circles, bar comparisons, growth arrows, numerical displays, timelines, data flows, visual statistics integrated naturally into the scene, NOT as background but as interactive foreground elements
|
Motion & Camera – camera angle (wide/medium/close), how characters interact with data, frozen moment of explanation or discovery
|
Stylization – {user_image_style} + clean infographic design, soft shading, modern professional aesthetic, clear visual hierarchy where DATA is always prominent and readable

Write ONE cohesive paragraph
Minimum length: 300–330 characters
Describe ONE frozen explanatory cinematic moment WHERE INFOGRAPHICS ARE CENTRAL
📊 MANDATORY INFOGRAPHIC VISUALIZATION RULES
TRIGGER WORDS → REQUIRED VISUAL ELEMENTS:
Numbers, percentages, statistics (10%, 5000, million, billion):

MUST show: large floating numbers, percentage circles with fill levels, numerical counters, digit displays on screens/billboards
Render numbers as LARGE visual objects (minimum 20-30% of frame)
Use contrasting colors for numbers (dark text on light panels or vice versa)

Growth, increase, rise, expansion, appreciation:

MUST show: upward arrows (thick, prominent), ascending line charts, stair-step growth patterns, stacked rising bars, upward trending curves
Make growth direction unmistakable and dominant in composition

Decline, decrease, fall, reduction, depreciation:

MUST show: downward arrows, descending charts, shrinking bars, falling curves, collapsing structures
Use red/orange tones for declining elements

Comparison, difference, versus, more than, less than:

MUST show: side-by-side bar charts of different heights, split-screen comparisons, balancing scales with unequal weights, opposing arrows of different sizes

Time-related (years, months, timeline, history, future):

MUST show: horizontal timelines with marked points, calendar grids, clock faces, progress bars with segments, chronological path visualization

Rates, speed, velocity, tempo (interest rate, growth rate):

MUST show: speedometer-style gauges, rate indicators, flowing particle streams at different speeds, multiple arrows at varying angles

Distribution, allocation, diversification, portfolio:

MUST show: pie charts, segmented circles, multiple containers with different fill levels, branching paths with percentage labels

Capitalization, market value, total worth:

MUST show: stacked coin towers of different heights, building-sized numerical displays, layered value blocks, accumulation pyramids

Risk vs reward, pros and cons:

MUST show: weighing scales, opposing arrows, split visual fields with contrasting colors, dual-panel comparisons

ABSOLUTE RULE:
If the input mentions ANY numerical concept, the image MUST dedicate 40-60% of the visual space to infographic elements showing that data.
🎯 INFOGRAPHIC INTEGRATION LEVELS
Level 1 (Background): Characters in front of large chart displays ❌ TOO WEAK
Level 2 (Interactive): Characters pointing at, touching, or presenting charts ✓ ACCEPTABLE
Level 3 (Immersive): Characters inside data environments, surrounded by floating statistics ✓✓ PREFERRED
Level 4 (Data-First): Infographics as main subject, characters secondary ✓✓✓ IDEAL FOR HEAVY DATA MOMENTS
Choose level based on input's data density.

🚫 STRICT PROHIBITIONS
Never include:

Logos, brand names, company names
Full sentences as text (numbers/percentages as visual objects are REQUIRED)
Real documents with paragraphs
Western cartoon styles
3D Pixar/Disney styles
Chibi or exaggerated anime
Photorealism
Multiple scenes in one image
Pure abstract art without clear data visualization
Decorative charts that don't convey the specific data mentioned

🎨 INFOGRAPHIC DESIGN PRINCIPLES
Visual Hierarchy:

Data elements: high contrast, large scale, central placement
Characters: supporting role, medium contrast
Environment: subtle, neutral background

Color Coding:

Growth/Positive: green, blue, upward motion
Decline/Negative: red, orange, downward motion
Neutral/Comparison: gray, yellow, horizontal
Percentages: circular fills with clear empty/filled distinction

Scale:

Charts should be 1.5-2x larger than human characters when data is the focus
Numbers should be readable even at thumbnail size
Use depth: foreground data, mid-ground characters, background environment

🎨 LIGHTING & COLOR

Soft, even lighting on infographic elements (no shadows obscuring data)
Warm neutral tones for environments
HIGH contrast for all numerical displays and charts
Data visualization uses strategic color: green (growth), red (decline), blue (neutral/info)
Background: desaturated; Foreground data: saturated

🎬 CAMERA LANGUAGE
Every prompt MUST clearly imply:

Camera distance (wide / medium / close)
Framing that prioritizes data visibility
Eye-level or slightly elevated for chart readability
Clean composition: data in visual center, characters to sides or behind

Data-Heavy Shots:

Wide: character + full infographic dashboard
Medium: character interacting with 2-3 data elements
Close: single large chart/number with character's hand/face
Stylization – {user_image_style}

🎯 OUTPUT FORMAT (ABSOLUTELY STRICT)
Output ONLY the image prompt text
No explanations
No markdown
No quotes
No line breaks
Exactly ONE prompt per input
ONE continuous paragraph
300–320 characters total
CRITICAL: Start your response immediately with the image description.
Do NOT include any reasoning or meta text.
"""
                user_task = f"Create a visual image prompt for this specific scene: '{text_chunk[:300]}'.\nVisualize the numbers and data mentioned!"
                
                messages = [
                    {"role": "system", "content": system_rules},
                    {"role": "user", "content": user_task}
                ]
                antigravity_prompt = self._call_ai(messages, model=self.prompt_model)
                if antigravity_prompt:
                     cleaned_prompt = antigravity_prompt.replace("Here is a prompt:", "").replace("Prompt:", "").strip()
                     if cleaned_prompt.startswith('"') and cleaned_prompt.endswith('"'):
                        cleaned_prompt = cleaned_prompt[1:-1]
                     return cleaned_prompt
                return f"{user_image_style} finance infographic about: {text_chunk[:100]}"

            # === SPECIAL MODE: SPACE ===
            elif text_style == "Космос":
                system_rules = """You are an AI assistant specialized in generating one highly detailed cinematic image generation prompt per input for animated documentary videos about space exploration, exoplanets, and astrobiology for YouTube.
You work in a scientific documentary aesthetic inspired by NASA, ESA, and National Geographic space documentaries, combining photorealistic space imagery with educational clarity.

🧠 CORE RULE (CRITICAL - PIPELINE WILL BREAK IF VIOLATED)

Each input represents EXACTLY ONE specific visual moment from the narration
The narration might be in Russian or other languages, but you MUST generate the prompt strictly in ENGLISH.
Generate ONE image prompt ONLY
DO NOT generate multiple visuals, lists, numbering, titles, headings, or summaries
DO NOT repeat or reference previous visuals
OUTPUT ONLY the final image prompt paragraph—no reasoning, no <think> tags, no explanations


🧾 INPUT CONTEXT
Each input you receive contains:

One sentence or phrase from the documentary narration
One specific visual concept (planet, star, spacecraft, cosmic phenomenon, scientific visualization)
One exact narrative moment

Your task: Transform scientific concepts into stunning cinematic visuals that educate and inspire, ready for animation.

🖼️ IMAGE PROMPT STRUCTURE (MANDATORY — Runway Gen-3 / Pika / Stable Video Compatible)
Your output MUST follow this structure using vertical bars | as separators:
[Main Subject – planet, star, spacecraft (like Voyager 1/2), or celestial phenomenon. Describe detailed physical characteristics, astronomical scale, and distinctive features.]
|
[Cosmic Environment – space location, surrounding nebulae, star fields, spatial depth, cosmic context. Strictly NO Earth-like backgrounds unless it's the planet Earth itself.]
|
[Scientific Data & Text (MANDATORY) – Minimalist futuristic HUD labels. Display specific numbers from the text: speeds (e.g., '17 km/s'), distances (e.g., '23 billion km'), dates (e.g., 'September 5, 1977'), or technical names (e.g., 'Golden Record'). Clean, glowing technical typography.]
|
[Motion & Dynamics – orbital movement, majestic slow drift, particle flows, antenna rotation, animation potential.]
|
[Aesthetic Control – realistic star lighting, ambient cosmic glow, wide-angle lens for scale, scientific documentary color grading.]
|
[Stylization – Scientific realism, NASA/National Geographic documentary aesthetic, 8K resolution, clean technical look.]

Requirements:

ONE cohesive paragraph (no line breaks within the prompt)
400–600 characters minimum
Describe ONE scientifically accurate cinematic moment with clear animation potential
Use precise astronomical terminology combined with vivid visual language
Emphasize cosmic scale, scientific wonder, and educational clarity

🌌 VISUAL STYLE: Scientific Space Documentary Realism
All prompts must embody:
✅ Photorealistic Space Documentary Aesthetic

NASA/ESA/National Geographic quality imagery
Scientifically accurate planetary surfaces, atmospheres, and cosmic phenomena
Realistic scale relationships (planets, stars, moons, spacecraft)
Authentic astronomical color palettes: deep space blacks, nebula blues/purples/oranges, planetary earth tones
Realistic lighting physics: stellar illumination, reflected light, atmospheric scattering
Subtle cosmic dust, star fields, nebula wisps for depth

✅ Scientific Data Visualization (MANDATORY)

If the narration mentions specific numbers, speeds, distances, or names, you MUST include them as minimalist, futuristic text overlays (HUD style).
Use clean, sans-serif glowing typography.
Labels should be small and non-intrusive, integrated into the cosmic scene as part of a high-tech documentary visualization.
Example: "Small technical label 'Proxima Centauri' glowing softly near the star", "HUD display showing speed '150,000 km/h' in the corner".

✅ Educational Clarity

Clear, distinguishable subjects (planets must look like real exoplanets, not fantasy art)
Accurate representation of scientific concepts (habitable zones, tidal locking, atmospheric composition)
Scale indicators when relevant (planet size relative to stars, moons, or familiar objects)

✅ Cinematic Documentary Quality

8K resolution documentary feel
Smooth gradients, natural color grading
Minimal film grain (clean, modern documentary look, not vintage)
Depth of field appropriate for cosmic scale
Professional color grading: rich blacks, balanced mid-tones, detailed highlights

✅ Animation-Ready Motion Cues

Describe orbital dynamics, atmospheric movement, cloud patterns
Indicate slow, majestic camera movements: orbital reveals, slow approaches, gentle pans across planetary surfaces
Suggest environmental motion: swirling atmospheres, aurora activity, volcanic plumes, ocean waves


🚫 STRICT PROHIBITIONS
Never include:

❌ Invasive UI elements that block the subject
❌ Logos (NASA, ESA, SpaceX, etc.)
❌ Flags, national symbols, political identifiers
❌ Agency or company names in any form
❌ Humans, astronauts, or any people (STRICTLY FORBIDDEN unless 'human' is the main subject in the text)
❌ Silhouettes or human-like figures
❌ Hands holding objects (unless strictly requested)
❌ Home/Office interiors (must be space/technical)
❌ Spacecraft with visible fictional branding or logos
❌ Unrealistic colors (neon, electric blues/pinks unless scientifically justified like auroras)


🎬 CAMERA & CINEMATIC LANGUAGE
Every prompt MUST specify:

Camera Position: Orbital view / Surface perspective / Atmospheric entry / Distant observation / Close planetary approach
Camera Movement: Slow orbital drift / Gentle approach / Static observation / Smooth pan across surface / Rotating reveal
Frame Composition: Wide establishing shot / Medium planetary view / Close-up of atmospheric detail / Extreme wide cosmic vista
Lens Feel: Documentary realism (wide-angle for cosmic scale, medium telephoto for planetary detail), shallow depth of field for foreground/background separation
Scientific Perspective: Educational clarity, showing scale and context


🌍 SUBJECT CATEGORIES & SPECIFIC GUIDELINES
Exoplanets

Specify planet type: rocky terrestrial, super-Earth, ocean world, ice planet, mini-Neptune
Describe surface features: oceans, ice caps, continents, volcanic activity, cloud patterns
Show atmospheric characteristics: thick/thin atmosphere, cloud coverage, storm systems, auroras
Indicate illumination: partial illumination (tidally locked), full illumination, terminator line visible
Include parent star type and color: red dwarf (dim orange/red light), yellow dwarf (Sun-like), orange dwarf

Stars & Stellar Systems

Specify star type and color: red dwarf (small, dim, orange-red), yellow dwarf (Sun-like, bright yellow-white), orange dwarf (medium, orange)
Show scale relative to planets or other objects
Indicate stellar activity: calm/serene surface vs. flares and coronal mass ejections
Include realistic stellar atmospheres and photospheres

Habitable Zones & Scientific Concepts

Visualize abstract concepts concretely: habitable zone as planetary orbit within specific distance range
Show comparative scale: Earth-like vs. super-Earth proportions
Illustrate scientific phenomena: tidal locking (one hemisphere illuminated), greenhouse effect (thick hazy atmosphere), ice coverage

Space Environments

Deep space: vast star fields, distant nebulae, cosmic dust clouds
Planetary systems: multiple planets in realistic orbital positions
Comparative shots: exoplanet compared to Earth or other known bodies (without text labels)


🎨 COLOR & LIGHTING GUIDELINES
Planetary Illumination

Red Dwarf Systems: Dim orange-red light, deep shadows, cooler color temperature (2500-3500K)
Yellow Dwarf Systems: Bright natural daylight, familiar Earth-like illumination (5000-6000K)
Orange Dwarf Systems: Warm orange-yellow light, slightly warmer than sunlight (4000-5000K)

Planetary Surfaces

Rocky/Terrestrial: Earth tones (browns, grays, tans), volcanic reds/oranges
Ocean Worlds: Deep blues, turquoise, white ice caps, cloud whites
Ice Planets: Whites, pale blues, gray shadows
Volcanic/Active: Glowing orange lava, dark basalt, ash grays

Atmospheres

Thin atmospheres: Subtle haze, stars visible through
Thick atmospheres: Dense cloud layers, no surface visible, atmospheric banding
Storm systems: Swirling patterns, lighter/darker zones
Auroras: Green, purple, blue curtains of light near polar regions (only if scientifically appropriate)


📐 SCALE & PERSPECTIVE GUIDANCE

Cosmic Vista: Show vast scale—planet small against star backdrop, multiple celestial objects showing orbital distances
Planetary Approach: Planet filling 50-80% of frame, showing curvature and atmospheric layers
Surface Detail: Close enough to see cloud patterns, continents, ice caps, but maintaining planetary context
Comparative Scale: When comparing sizes, show proportional relationships clearly without text


🎯 OUTPUT FORMAT (ABSOLUTELY STRICT)
OUTPUT ONLY:

The final image prompt text as ONE continuous paragraph
No labels, numbering, bullet points, section headers, or markdown formatting
No explanations, reasoning, or <think> tags before or after
No quotation marks or line breaks within the prompt

Length: 400–600 characters total
Start your response immediately with the image description paragraph.
"""
                user_task = f"Create a visual image prompt for this specific scene: '{text_chunk[:300]}'.\nVisualize the cosmic scale and scientific details!"
                
                messages = [
                    {"role": "system", "content": system_rules},
                    {"role": "user", "content": user_task}
                ]
                antigravity_prompt = self._call_ai(messages, model=self.prompt_model)
                if antigravity_prompt:
                     cleaned_prompt = antigravity_prompt.replace("Here is a prompt:", "").replace("Prompt:", "").strip()
                     return cleaned_prompt
                return f"Cinematic space documentary shot of: {text_chunk[:100]}"

            # === DEFAULT MODE ===

            # 1. Detect Context & Select Template
            is_infographic_context = False
            if image_style:
                infographic_keywords = ["infographic", "business", "finance", "chart", "data", "corporate", "analytics", "statistics"]
                if any(keyword in image_style.lower() for keyword in infographic_keywords):
                    is_infographic_context = True

            # 2. Define Structures
            if is_infographic_context:
                target_structure = (
                    "Main Character(s) or Visual Focus – anime-style human characters OR infographic elements as the primary focus, detailed appearance, professional clothing, facial expression, body language, interaction with data visualizations\n"
                    "|\n"
                    "Scene & Environment – modern office, city interior, conference room, OR abstract data-space where financial concepts exist as physical structures\n"
                    "|\n"
                    "Infographic Layer (MANDATORY) – charts, graphs, percentage circles, bar comparisons, growth arrows, numerical displays, timelines, data flows, visual statistics integrated naturally into the scene, NOT as background but as interactive foreground elements\n"
                    "|\n"
                    "Motion & Camera – camera angle (wide/medium/close), how characters interact with data, frozen moment of explanation or discovery\n"
                    "|\n"
                    f"Stylization – {image_style} , soft shading, modern professional aesthetic, clear visual hierarchy where DATA is always prominent and readable"
                )
            else:
                target_structure = (
                    "Main Subject – EITHER the elderly narrator (Type A) OR the people/scene from the memory (Type B). Describe age-appropriate features, clothing for the era, expressions, emotional state\n"
                    "|\n"
                    "Scene & Environment – MATCH the scene type: present-day interior for Type A, OR historical/memory setting for Type B with appropriate time period details\n"
                    "|\n"
                    "Motion & Gesture – natural body language and actions matching the scene type\n"
                    "|\n"
                    "Lighting & Cinematography – lighting style, time of day, camera angle (wide/medium/close), focus, depth\n"
                    "|\n"
                    f"Style & Texture – {image_style}"
                )

            # 3. Form System Rules
            system_rules = "You are an expert visual director. Your task is to create concise, strictly structured image generation prompts.\n\n"
            
            # КРИТИЧЕСКИ ВАЖНЫЙ КОНТЕКСТ
            if story_setting:
                system_rules += f"📋 MANDATORY CONTEXT (apply to ALL elements):\n{story_setting}\n\n"
                system_rules += "⚠️ CRITICAL RULES:\n"
                system_rules += "- EVERY object/person/detail MUST match the historical period described above\n"
                system_rules += "- NO modern items allowed (no plastic, smartphones, modern clothing, etc.)\n"
                system_rules += "- RESPECT living conditions (poverty vs luxury)\n\n"

            if character_profile:
                system_rules += """
🎭 CHARACTER BIBLE — BIOGRAPHICAL AGING ARC SYSTEM:

The following is a complete Character Bible for this biographical story.
It defines PERMANENT DNA traits (never change) and LIFE STAGE appearances (age-appropriate).
You MUST use both layers for every character appearing in a scene.

"""
                system_rules += character_profile + "\n\n"
                system_rules += """
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  ABSOLUTE RULES FOR CHARACTER CONSISTENCY ACROSS ALL AGES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RULE 1 — DNA NEVER CHANGES:
  The following features are GENETICALLY FIXED and appear IDENTICALLY at ALL ages:
  eye color, iris pattern, ear shape, nose structure, lip shape, jaw/cheekbone structure,
  skin ethnicity/tone, hand structure. These MUST be identical in EVERY scene.
  Always wrap DNA_SEED in ((double parentheses)) at the START of character description.

RULE 2 — DETERMINE LIFE STAGE FROM SCENE CONTEXT:
  Before writing the prompt, IDENTIFY which life stage applies to this scene:
  → CHILDHOOD (0-12): chubby face, small build, innocent eyes, no beard
  → YOUTH (13-25): angular emerging features, lean build, full original hair color, light stubble at most
  → PRIME (26-45): defined confident face, slight eye lines, strong build, beard possible, first grey temples
  → MATURITY (46-65): deeper lines, salt-and-pepper hair, stockier, beard greying if present
  → OLD AGE (66+): deep wrinkles, white/grey thin hair, stooped posture, white beard if present
  Use text clues: age mentions, historical events, life milestones (school/work/retirement)

RULE 3 — BEARD LOGIC:
  → Childhood/Youth: NO beard (or light peach fuzz at most for late teens)
  → Prime: Clean-shaven OR neat dark beard with first grey strands (if story implies it)
  → Maturity: Beard greying at edges, more salt than pepper
  → Old Age: Full white/grey beard OR clean-shaven — match story context
  NEVER add a beard if the story does not imply or describe facial hair.

RULE 4 — HAIR AGING LOGIC:
  → Childhood/Youth: ORIGINAL natural hair color from DNA card, full thick hair
  → Prime: Same color, first silver strands at temples only
  → Maturity: Salt-and-pepper (50/50 or more grey), same style tendency
  → Old Age: Mostly white or full grey, thinner, possibly receding
  PRESERVE the original hair STYLE TENDENCY (wavy/straight/curly) at all ages.

RULE 5 — PROPORTIONS AND BUILD BY AGE:
  → Childhood: Head proportionally larger, shorter limbs, rounded features
  → Youth: Height approaching adult, lean/lanky, still growing
  → Prime: Full adult height, peak physical condition per character type
  → Maturity: Same height, possible weight gain or maintained, slight posture change
  → Old Age: Slight height reduction, stooped or curved spine, slower movement implied

RULE 6 — ONE FACE RULE:
  Every scene shows ONE version of the character appropriate to THAT scene age.
  NEVER show young and old versions of same person in one frame.
  NEVER mix age features (no young skin + white hair, no wrinkles + full dark hair).

RULE 7 — MULTIPLE CHARACTERS IN SCENE:
  If the scene features 2+ characters, include DNA_SEED of EACH in ((double parentheses)).
  Apply correct life stage independently to EACH character.

RULE 8 — CLOTHING IS ERA + AGE APPROPRIATE:
  Child clothing ≠ adult clothing even in same era. Use age-appropriate garments.
  Working-class youth wears different clothes than a master craftsman at 50.
  Respect the social status evolution across the character arc.
"""
                if character_seed:
                    system_rules += f"\n- Global visual consistency DNA seed: {character_seed}\n"
                system_rules += "\n"
            
            system_rules += "🎬 SCENE DESCRIPTION & SUBJECT HIERARCHY:\n"
            system_rules += "- 🧠 LOGICAL NEGATIONS (STRICT RULE): If the input text describes the absence of something (e.g., 'no coins', 'without phones', 'never saw a car'), you MUST NOT include these objects in the prompt. Visualizing them even with a 'no' prefix in the prompt often confuses AI. Instead, visualize the VACUUM or the ALTERNATIVE (e.g., for 'no money', show 'gathering fruit' or 'bartering skins').\n"
            system_rules += "- 🚫 NO ANACHRONISMS: If the context is historical (e.g., prehistoric, medieval), even if the narration mentions modern things for comparison, NEVER include them in the visual. Keep the camera focused ONLY on era-appropriate visuals.\n"
            if not is_infographic_context: # Only apply Photo rule for Narrative mode
                system_rules += "- ⚠️ CRITICAL RULE FOR PHOTOS/MEMORIES (CONDITIONAL):\n"
                system_rules += "    **APPLY ONLY IF the text explicitly mentions looking at a physical photo, picture, or album:**\n"
                system_rules += "    1. You MUST use a **POV Shot** (First-Person View).\n"
                system_rules += "    2. Show the **narrator's hands holding the photograph** in front of the camera.\n"
                system_rules += "    3. The content of the photo should be visible on the paper being held.\n"
                system_rules += "    4. Do NOT show the narrator's face. Show what they see (hands + photo).\n"
                system_rules += "    5. Start the prompt with: 'POV shot, close-up of hands holding a photograph...'\n"
                system_rules += "\n"
            
            system_rules += "🖼️ IMAGE PROMPT STRUCTURE (MANDATORY):\n"
            system_rules += "Your output MUST strictly follow this structure, using vertical bars | as separators.\n"
            system_rules += "Do NOT verify or explain. Output ONLY the filled structure strings.\n\n"
            system_rules += f"{target_structure}\n\n"
            
            system_rules += "📤 OUTPUT FORMAT:\n"
            system_rules += "- Provide ONLY the final English image generation prompt following the structure above\n"
            system_rules += "- CRITICAL: Even if the input text is in Russian, the output MUST be strictly in ENGLISH.\n"
            system_rules += "- Ensure the 'Stylization' or 'Style & Texture' section contains ONLY the user style provided in the structure. DO NOT add artistic filters like watercolor or sketches unless they are part of the image_style string.\n"
            system_rules += f"- STICK TO THE STYLE: {image_style}\n"
            
            # 2. Формируем ЗАДАЧУ ПОЛЬЗОВАТЕЛЯ (Конкретная сцена)
            user_task = f"SCENE TEXT (original language): '{text_chunk[:450]}'\n\n"
            user_task += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            user_task += "STEP 1 — DETERMINE LIFE STAGE:\n"
            user_task += "  Look at the scene text and identify which life stage applies to EACH character:\n"
            user_task += "  • What age/period is described? (childhood, youth, adult life, old age?)\n"
            user_task += "  • Are there clues: school, apprenticeship, career peak, retirement, death?\n"
            user_task += "  • Does the text mention age directly or reference historical events?\n"
            user_task += "  Select the correct LIFE STAGE from the Character Bible for each character.\n\n"
            user_task += "STEP 2 — BUILD CHARACTER DESCRIPTION:\n"
            user_task += "  For each character in this scene:\n"
            user_task += "  • Start with ((DNA_SEED)) in double parentheses\n"
            user_task += "  • Apply the correct LIFE STAGE appearance (age-appropriate face, hair, beard, build)\n"
            user_task += "  • DNA traits (eye color, face structure, nose, lips, ears) stay IDENTICAL to Bible\n"
            user_task += "  • Hair/beard color matches the life stage aging rules\n\n"
            user_task += "STEP 3 — GENERATE THE IMAGE PROMPT:\n"
            user_task += "  • Follow the mandatory | separated structure\n"
            user_task += "  • Write in ENGLISH only (scene text may be in any language)\n"
            user_task += "  • Capture the EMOTION and ACTION of this specific scene\n"
            user_task += "  • Include era-appropriate environment matching story_setting\n"
            user_task += "  • ONE continuous prompt, no lists, no explanations\n"
            user_task += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"

            # 1. Try Pollinations.ai with gemini or openai
            messages = [
                {"role": "system", "content": system_rules},
                {"role": "user", "content": user_task}
            ]
            
            # Используем модель выбранную пользователем для промптов
            antigravity_prompt = self._call_ai(messages, model=self.prompt_model)
            
            if antigravity_prompt:
                cleaned_prompt = antigravity_prompt.replace("Here is a prompt:", "").replace("Prompt:", "").strip()
                # Remove quotes if AI added them around the whole string
                if cleaned_prompt.startswith('"') and cleaned_prompt.endswith('"'):
                    cleaned_prompt = cleaned_prompt[1:-1]
                
                # Validation: Check if | exists (if not, force format or accept as is)
                if "|" not in cleaned_prompt:
                     # Fallback formatting if AI ignored structure (rare with 'openai' model)
                     cleaned_prompt = f"{cleaned_prompt} | {image_style if image_style else 'Cinematic'}"

                return cleaned_prompt

            # 2. Try g4f (Fallback)
         
            if self.use_openai: 
                try: 
                    from g4f.client import Client
                    client = Client()
                    models = ["gpt-4o-mini", "gpt-4", "gpt-4o", "llama-3.1-70b", "blackbox"]
                    
                    for model in models:
                        try:
                            response = client.chat.completions.create(
                                model=model,
                                messages=[
                                    {"role": "system", "content": system_rules},
                                    {"role": "user", "content": user_task}
                                ],
                            )
                            if response.choices and response.choices[0].message.content:
                                ai_prompt = response.choices[0].message.content.strip()
                                if image_style:
                                    return f"{ai_prompt}. Style: {image_style}"
                                return ai_prompt
                        except Exception:
                            continue
                            
                    # print("Все модели g4f для генерации промпта не сработали.")
                except Exception as e:
                    # print(f"Ошибка генерации промпта через AI: {e}")
                    pass
        
        # Fallback: создаем простой промпт из текста
        # Берем ключевые слова из текста (первые 50 слов)
        words = text_chunk.split()[:50]
        prompt_text = ' '.join(words).replace('\n', ' ')
        if image_style:
            return f"{prompt_text}. Style: {image_style}"
        return prompt_text
    
    def validate_prompts_style(self, prompts: List[str], style: str) -> List[str]:
        """
        Дополнительная проверка промптов на соответствие заданному стилю.
        Если стиль отсутствует или промпт ему противоречит, AI переписывает промпт.
        
        Args:
            prompts: Список сгенерированных промптов
            style: Целевой визуальный стиль
            
        Returns:
            Список проверенных и исправленных промптов
        """
        if not style or not prompts:
            return prompts
            
        print(f"[INFO] Validating {len(prompts)} prompts for style: '{style}'...")
        
        # Подготавливаем данные для AI: список промптов пронумерован
        prompts_text = "\n".join([f"{i+1}. {p}" for i, p in enumerate(prompts)])
        
        prompt_instruction = f"""
        Review the following image generation prompts and ensure they strictly adhere to the visual style: '{style}'.
        
        STRICT RULES:
        1. Every prompt MUST include characteristic elements of the style '{style}'.
        2. If a prompt contradicts the style or lacks its specific descriptors, REWRITE it to be perfectly compliant.
        3. Maintain the core scene content of each prompt, but wrap it in the required style.
        4. The output must be a valid JSON list of strings, where each string is the final corrected prompt.
        5. Provide ONLY the JSON - no explanations, no conversational text.
        
        PROMPTS TO VALIDATE:
        {prompts_text}
        
        OUTPUT FORMAT (JSON List):
        ["Corrected prompt 1", "Corrected prompt 2", ...]
        """
        
        messages = [
            {"role": "system", "content": "You are an expert prompt engineer and creative director. Your job is to enforce visual style consistency in image prompts."},
            {"role": "user", "content": prompt_instruction}
        ]
        
        try:
            # Используем gemini-3.1-pro-high для качественной работы с JSON
            response = self._call_ai(messages, model="gemini-3.1-pro-high")
            if response:
                # Пытаемся распарсить JSON
                import re
                json_match = re.search(r'\[.*\]', response, re.DOTALL)
                if json_match:
                    try:
                        valid_prompts = json.loads(json_match.group())
                        if isinstance(valid_prompts, list) and len(valid_prompts) == len(prompts):
                            print("✅ Style validation complete. Prompts updated.")
                            return valid_prompts
                    except Exception as je:
                        print(f"⚠️ Error parsing validated prompts JSON: {je}")
                else:
                    print("⚠️ AI did not return a valid JSON list for prompt validation.")
        except Exception as e:
            print(f"⚠️ Prompt style validation failed: {e}")
            
        # Если что-то пошло не так, возвращаем оригиналы (лучше чем ничего)
        return prompts
    
    def split_text_by_words(self, text: str, min_words: int = 50, max_words: int = 80, double_duration: bool = False) -> List[str]:
        """
        Разбиение текста на части по количеству слов (50-80 слов)
        Разбиение происходит по смыслу или по окончанию предложения
        
        Args:
            text: Текст для разбиения
            min_words: Минимальное количество слов в части
            max_words: Максимальное количество слов в части
            double_duration: Увеличить лимиты в 2 раза
        
        Returns:
            Список частей текста
        """
        if double_duration:
            min_words *= 2
            max_words *= 2
        # Очищаем текст от markdown
        # Удаляем markdown заголовки
        lines = text.split('\n')
        cleaned_lines = []
        
        for line in lines:
            # Пропускаем заголовки
            if line.startswith('#'):
                continue
            # Удаляем markdown разметку
            line = line.replace('**', '').replace('*', '').replace('_', '')
            # Удаляем лишние пробелы
            line = line.strip()
            if line:
                cleaned_lines.append(line)
        
        clean_text = ' '.join(cleaned_lines)
        
        # Разбиваем на предложения
        sentences = []
        for sent in clean_text.split('.'):
            sent = sent.strip()
            if sent:
                sentences.append(sent + '.')
        
        if not sentences:
            return [clean_text]
        
        chunks = []
        current_chunk = []
        current_word_count = 0
        
        for sentence in sentences:
            words = sentence.split()
            word_count = len(words)
            
            # Если добавление предложения не превышает максимум
            if current_word_count + word_count <= max_words:
                current_chunk.append(sentence)
                current_word_count += word_count
            else:
                # Если текущий chunk достиг минимума, сохраняем его
                if current_word_count >= min_words:
                    chunks.append(' '.join(current_chunk).strip())
                    current_chunk = [sentence]
                    current_word_count = word_count
                else:
                    # Если не достиг минимума, добавляем предложение (может превысить максимум)
                    current_chunk.append(sentence)
                    current_word_count += word_count
                    # Если сильно превысили, все равно сохраняем
                    if current_word_count > max_words * 1.5:
                        chunks.append(' '.join(current_chunk).strip())
                        current_chunk = []
                        current_word_count = 0
        
        # Добавляем последний chunk
        if current_chunk:
            chunks.append(' '.join(current_chunk).strip())
        
        return chunks if chunks else [clean_text]

    def split_text_by_sentences(self, text: str, double_duration: bool = False) -> List[str]:
        """
        Разбиение текста строго по предложениям с глубокой очисткой от режиссерских ремарок.
        
        Args:
            text: Текст для разбиения
            double_duration: Увеличить длительность клипов в 2 раза
            
        Returns:
            Список предложений (чистая озвучка)
        """
        import re

        # 0. Очистка от URL и спам-контента (модели иногда вставляют рекламу в текст)
        text = re.sub(r'https?://\S+', '', text)
        text = re.sub(r'www\.\S+', '', text)
        spam_patterns = [
            r'Need proxies.{0,150}',
            r'cheaper than the market.{0,150}',
            r'op\.wtf.{0,150}',
        ]
        for _sp in spam_patterns:
            text = re.sub(_sp, '', text, flags=re.IGNORECASE)
        
        # 1. Удаляем Markdown жирность/курсив
        text = text.replace('**', '').replace('__', '')
        
        # 2. Удаляем заголовки в квадратных скобках [Вступление]
        text = re.sub(r'\[.*?\]', '', text)
        
        # 3. Удаляем режиссерские ремарки в круглых скобках (Картинка: ...)
        # Используем flag DOTALL чтобы ловить многострочные скобки если нужно, но обычно они в одну строку
        text = re.sub(r'\(.*?\)', '', text)
        
        # 4. Удаляем разделители (---)
        lines = text.split('\n')
        cleaned_lines = []
        for line in lines:
            line = line.strip()
            # Пропускаем пустые, #, и линии из --- ===
            if not line or line.startswith('#') or set(line).issubset({'-', '=', '_', ' '}):
                continue
            cleaned_lines.append(line)
            
        cleaned_text = " ".join(cleaned_lines)
        
        # Дополнительная чистка от множественных пробелов
        cleaned_text = re.sub(r'\s+', ' ', cleaned_text).strip()
            
        # Разбиваем по знакам препинания (. ! ?), сохраняя их
        # (?<=[.!?]) - lookbehind, ищет место ПОСЛЕ знака
        sentences = re.split(r'(?<=[.!?])\s+', cleaned_text)
        
        # 5. Smart Merge Logic
        final_sentences = []
        current_chunk = ""
        MIN_WORDS = 24 if double_duration else 12 # Минимальная длина предложения для отдельной сцены/озвучки
        
        for sent in sentences:
            sent = sent.strip()
            # Фильтруем пустые и мусор
            if not sent or len(sent) < 2 or set(sent).issubset({'.', '!', '?', ':', '-'}):
                continue
                
            if not current_chunk:
                current_chunk = sent
            else:
                # Merge if current chunk is too small
                if len(current_chunk.split()) < MIN_WORDS:
                    current_chunk += " " + sent
                else:
                    final_sentences.append(current_chunk)
                    current_chunk = sent
        
        if current_chunk:
            final_sentences.append(current_chunk)
            
        return final_sentences if final_sentences else [text]
    
    def generate_images(self, prompts: List[str], style: str = "") -> List[str]:
        """
        Генерация изображений через AI (заглушка)
        
        Args:
            prompts: Список промптов
            style: Стиль изображений
        
        Returns:
            Список путей к изображениям
        """

    def generate_video_prompt(self, text_chunk: str) -> str:
        """
        Генерация специального промпта для ВИДЕО из стартового изображения.
        Видео генерируется в режиме start_image — изображение уже задаёт сцену,
        промпт должен описывать ДВИЖЕНИЕ внутри этой сцены.
        """
        print(f"[INFO] Generating VIDEO prompt for text: {text_chunk[:50]}...")
        
        system_rules = (
            "You are an expert video director specializing in AI video generation from a START IMAGE.\n"
            "The video will be generated using an existing image as the first frame (start_image mode).\n"
            "Your task is to create a prompt that DESCRIBES THE SCENE AND THE MOTION.\n\n"
            "STRICT RULES:\n"
            "1. Start by briefly describing the key characters and environment from the narrative moment provided.\n"
            "2. Then, describe the NATURAL MOTION and CAMERA MOVEMENT that fits this scene.\n"
            "3. Focus on: subtle character movements, camera motion, environmental effects.\n"
            "   Examples: 'A weary traveler sits by the fire, slow camera push in, flames flicker, wind moves through hair'.\n"
            "4. Do NOT describe scene changes or new characters not mentioned in the narrative - the image is fixed.\n"
            "5. Keep it SHORT: 30-50 words maximum.\n"
            "6. NO dialogue, NO abstract concepts, NO story narration.\n"
            "7. Output ONLY the English prompt — even if the input text is in Russian.\n"
        )
        
        user_task = (
            f"The scene depicted in the image corresponds to this narrative moment:\n"
            f"'{text_chunk[:300]}'\n\n"
            f"Write a SHORT motion prompt (20-40 words) describing ONLY the natural movement "
            f"and camera behavior within this existing scene."
        )

        messages = [
            {"role": "system", "content": system_rules},
            {"role": "user", "content": user_task}
        ]
        
        try:
            # Используем модель выбранную пользователем для видео-промптов
            video_prompt = self._call_ai(messages, model=self.video_prompt_model)
            if video_prompt:
                cleaned = video_prompt.replace("Prompt:", "").replace("Video Prompt:", "").strip()
                # Убираем кавычки если AI обернул
                if cleaned.startswith('"') and cleaned.endswith('"'):
                    cleaned = cleaned[1:-1]
                print(f"[INFO] Generated Video Prompt: {cleaned}")
                return cleaned
        except Exception as e:
            print(f"[ERROR] Video prompt generation failed: {e}")

        # Fallback
        return "Slow cinematic camera push in, subtle natural movements, soft ambient motion"




