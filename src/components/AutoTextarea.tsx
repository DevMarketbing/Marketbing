import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from "react";

/**
 * A textarea that grows to fit its text, so nothing is hidden behind an
 * inner scrollbar — on a narrow phone a 2-line box would otherwise cut
 * pre-filled text off mid-sentence.
 */
export default function AutoTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.height = "auto";
      // + border, which scrollHeight leaves out.
      el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
    };
    fit();
    // Re-fit when the width changes (rotation, window resize) and text rewraps.
    // Height changes are our own, so they're ignored.
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      fit();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [props.value]);

  return <textarea ref={ref} {...props} className={`resize-none overflow-hidden ${props.className ?? ""}`} />;
}
