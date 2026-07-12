# Паттерн: Модальное окно предпросмотра видео (React)

Этот паттерн используется в разделе `PrimateCast` для быстрого и удобного предпросмотра сгенерированных видео-сегментов без перехода на другие страницы.

## Принцип работы

Реализация опирается на 3 основных элемента:
1. **Состояние (State)**, хранящее ссылку на видео (Base64 или URL).
2. **Элемент-триггер** (миниатюра видео), который по клику записывает ссылку в состояние.
3. **Модальное окно (Overlay)**, которое рендерится поверх всего интерфейса, если состояние не пустое.

## 1. Объявление состояния

В главном компоненте создается состояние для хранения ссылки на видео, которое мы хотим посмотреть. Если оно равно `null`, модальное окно скрыто.

```tsx
const [previewVideo, setPreviewVideo] = useState<string | null>(null);
```

## 2. Элемент для вызова (Превью-миниатюра)

В списке сгенерированных видео выводится маленькая миниатюра. При клике на неё мы передаем ссылку видео в `setPreviewVideo`.

```tsx
<div
  onClick={() => setPreviewVideo(seg.videoBase64!)}
  style={{ cursor: 'pointer', position: 'relative' }}
  title="Нажмите для просмотра"
>
  <video
    src={seg.videoBase64}
    style={{ width: '80px', height: '45px', objectFit: 'cover', borderRadius: '4px' }}
    muted
  />
  {/* Иконка Play поверх миниатюры */}
  <div style={{
    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '18px', backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: '4px'
  }}>▶</div>
</div>
```

## 3. Модальное окно (Overlay)

Выносим модальное окно в отдельную функцию рендера (например, `renderPreviewModal`) или прописываем прямо в JSX перед закрывающим тегом корневого элемента.

**Ключевые фишки модального окна:**
- `position: 'fixed', inset: 0, zIndex: 9999` — растягивает черный полупрозрачный фон на весь экран поверх других элементов.
- `onClick={() => setPreviewVideo(null)}` на фоне позволяет закрыть видео, просто кликнув мимо него (удобный UX).
- `onClick={e => e.stopPropagation()}` на контейнере самого плеера предотвращает закрытие окна при клике на само видео.
- Тег `<video>` имеет атрибуты `controls` и `autoPlay`, чтобы сразу начать воспроизведение со звуком и дать пользователю панель управления.
- Размеры ограничены `maxWidth: '80vw'` и `maxHeight: '80vh'`, чтобы видео не выходило за края экрана.

```tsx
const renderPreviewModal = () => previewVideo ? (
  <div
    // Закрытие при клике на черный фон
    onClick={() => setPreviewVideo(null)}
    style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
    }}
  >
    {/* Остановка всплытия клика, чтобы клик по плееру не закрывал окно */}
    <div onClick={e => e.stopPropagation()} style={{ position: 'relative' }}>
      <video
        src={previewVideo}
        controls
        autoPlay
        style={{ 
            maxWidth: '80vw', maxHeight: '80vh', 
            borderRadius: '10px', boxShadow: '0 0 40px rgba(0,0,0,0.8)' 
        }}
      />
      
      {/* Кнопка-крестик в правом верхнем углу */}
      <button
        onClick={() => setPreviewVideo(null)}
        style={{
          position: 'absolute', top: '-12px', right: '-12px',
          width: '30px', height: '30px', borderRadius: '50%',
          backgroundColor: '#ef4444', color: '#fff', border: 'none',
          cursor: 'pointer', fontSize: '16px', fontWeight: 'bold'
        }}
      >✕</button>
    </div>
  </div>
) : null;
```

## 4. Рендер

В самом конце вашего основного компонента просто вызовите метод рендера:

```tsx
  return (
    <div className="main-app-container">
      {/* ... остальной интерфейс приложения ... */}
      
      {renderPreviewModal()}
    </div>
  );
```

## Почему этот подход хорош:
- **Нет сторонних библиотек**: чистый React + CSS.
- **Прекрасный UX**: видео воспроизводится автоматически, модалку легко закрыть, кликнув в любую точку вне экрана или на крестик.
- **Изоляция кликов**: функция `e.stopPropagation()` решает главную проблему модальных окон, когда клик по контенту случайно закрывает всё окно.
