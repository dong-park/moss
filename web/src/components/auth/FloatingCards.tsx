"use client";

import { useEffect, useRef } from "react";

/**
 * 로그인 전 첫 화면 배경 — 메모·사진 카드가 기울어진 채 천천히 떠다닌다 (시안 A, cosmos.so 구도).
 * 장식이라 스크린리더에서 숨기고 포인터도 받지 않는다. 1440×900 무대를 화면을 덮도록 키운다.
 */

const W = 1440;
const H = 900;

type Card =
  | { t: "note" | "hand"; c?: string; text: string }
  | { t: "check"; title: string; items: [string, boolean][] }
  | { t: "photo"; label: string; bg: string }
  | { t: "link"; title: string; site: string; fav: string }
  | { t: "board"; title: string; count: string };

const CARDS: Card[] = [
  { t: "photo", label: "제주 협재", bg: "linear-gradient(170deg,#dfe6dc 0 30%,#a9c2b6 30% 55%,#eadcbe 55%,#d6c09a)" },
  { t: "check", title: "여행 짐", items: [["여권", true], ["충전기", true], ["우산", false]] },
  { t: "link", title: "제주 맛집 지도", site: "map.naver.com", fav: "#5f9b6a" },
  { t: "hand", c: "yellow", text: "렌터카 예약 잊지 말기" },
  { t: "note", text: "비행기 금요일 7:10 출발" },
  { t: "photo", label: "10월 산책 코스", bg: "linear-gradient(170deg,#f2d9a8,#d9914f 55%,#8b5a3c)" },
  { t: "photo", label: "베란다 수국", bg: "radial-gradient(circle at 40% 40%,#ead0de,#c79dba 45%,#93a68c 80%)" },
  { t: "hand", c: "lime", text: "아이디어는 산책할 때 온다" },
  { t: "note", c: "purple", text: "좋아하는 단어: 윤슬" },
  { t: "check", title: "이사 준비", items: [["인터넷 이전 신청", true], ["관리비 정산", false], ["화분 옮기기", false]] },
  { t: "note", text: "관리사무소 전화는 10시 이후" },
  { t: "photo", label: "새 집 거실", bg: "linear-gradient(180deg,#f1eadf 0 58%,#cdb99c 58%)" },
  { t: "board", title: "새 집 가구", count: "카드 8장" },
  { t: "hand", c: "yellow", text: "화분은 직접 옮기기" },
  { t: "check", title: "읽을 책", items: [["아주 작은 습관의 힘", true], ["도둑맞은 집중력", false]] },
  { t: "link", title: "기록하는 습관을 만드는 3가지 방법", site: "brunch.co.kr", fav: "#2c2e33" },
  { t: "note", c: "lime", text: "다음 분기 목표: 매주 글 1편" },
  { t: "hand", text: "천천히, 그래도 매일" },
  { t: "link", title: "회고 템플릿", site: "notion.so", fav: "#6a6c72" },
  { t: "note", text: "회의 끝나고 질문 2개 정리해서 보내기" },
  { t: "note", c: "blue", text: "발표 슬라이드 7장을 5장으로" },
  { t: "photo", label: "화이트보드 사진", bg: "repeating-linear-gradient(8deg,transparent 0 22px,rgba(90,110,90,.35) 22px 24px),linear-gradient(#f5f4f0,#e2dfd7)" },
  { t: "board", title: "3분기 회고", count: "카드 14장" },
  { t: "note", c: "yellow", text: "토요일 장보기 전에 냉장고 먼저 확인" },
  { t: "hand", text: "고양이 사료 주문" },
  { t: "note", c: "purple", text: "엄마 생신 선물 — 스카프? 찻잔?" },
  { t: "photo", label: "망원동 카페 메뉴판", bg: "linear-gradient(150deg,#6b4a36,#a87d5a 60%,#e8d5bb)" },
  { t: "link", title: "15분 집밥 레시피", site: "youtube.com", fav: "#c4544a" },
];

const WIDTH: Record<Card["t"], number> = { note: 170, hand: 168, check: 188, photo: 176, link: 196, board: 172 };

type Placed = { x: number; y: number; r: number; z: number; ph: number; sp: number };

/** 시드 고정 난수로 흩어 놓는다 — 매번 같은 구도, 가운데 타원은 카피 자리라 비운다. */
function scatter(): Placed[] {
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out: Placed[] = [];
  for (let i = 0; i < CARDS.length; i++) {
    let x = 0;
    let y = 0;
    let k = 0;
    do {
      x = -30 + rand() * (W - 150);
      y = -20 + rand() * (H - 110);
      k++;
    } while (
      ((x + 90 - 720) / 470) ** 2 + ((y + 70 - 450) / 280) ** 2 < 1 ||
      (k < 300 && out.some((p) => Math.hypot(p.x - x, p.y - y) < 125))
    );
    out.push({ x, y, r: (rand() - 0.5) * 22, z: 0.66 + rand() * 0.42, ph: rand() * 6.28, sp: 0.7 + rand() * 0.6 });
  }
  return out;
}

const PLACED = scatter();

function Body({ card }: { card: Card }) {
  switch (card.t) {
    case "note":
    case "hand":
      return <p>{card.text}</p>;
    case "check":
      return (
        <>
          <b>{card.title}</b>
          <ul>
            {card.items.map(([label, done]) => (
              <li key={label} className={done ? "on" : undefined}>
                {label}
              </li>
            ))}
          </ul>
        </>
      );
    case "photo":
      return (
        <>
          <div className="ph" style={{ background: card.bg }} />
          <span>{card.label}</span>
        </>
      );
    case "link":
      return (
        <>
          <small>
            <span className="fav" style={{ background: card.fav }}>
              {card.site[0].toUpperCase()}
            </span>
            {card.site}
          </small>
          <p>{card.title}</p>
        </>
      );
    case "board":
      return (
        <>
          <div className="bd">
            <i />
            <i />
            <i />
            <i />
          </div>
          <b>{card.title}</b>
          <small>{card.count}</small>
        </>
      );
  }
}

export function FloatingCards() {
  const stage = useRef<HTMLDivElement>(null);
  const cards = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const fit = () => {
      const s = Math.max(window.innerWidth / W, window.innerHeight / H);
      el.style.transform = `translate(-50%,-50%) scale(${s})`;
    };
    fit();
    window.addEventListener("resize", fit);

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let raf = 0;
    const frame = (t: number) => {
      PLACED.forEach((p, i) => {
        const node = cards.current[i];
        if (!node) return;
        const dx = reduce ? 0 : Math.sin(t * 0.00023 * p.sp + p.ph) * 14;
        const dy = reduce ? 0 : Math.cos(t * 0.00029 * p.sp + p.ph * 1.3) * 18;
        const dr = reduce ? 0 : Math.sin(t * 0.00019 + p.ph) * 2;
        node.style.transform = `translate(${p.x + dx}px,${p.y + dy}px) rotate(${p.r + dr}deg) scale(${p.z})`;
      });
      if (!reduce) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", fit);
    };
  }, []);

  return (
    <div aria-hidden className="moss-float pointer-events-none absolute inset-0 overflow-hidden">
      <div ref={stage} className="stage">
        {CARDS.map((card, i) => (
          <div
            key={i}
            ref={(n) => {
              cards.current[i] = n;
            }}
            className={`card ${card.t} ${"c" in card && card.c ? card.c : ""} ${PLACED[i].z < 0.78 ? "far" : ""}`}
            style={{
              width: WIDTH[card.t],
              zIndex: Math.round(PLACED[i].z * 100),
              transform: `translate(${PLACED[i].x}px,${PLACED[i].y}px) rotate(${PLACED[i].r}deg) scale(${PLACED[i].z})`,
            }}
          >
            <Body card={card} />
          </div>
        ))}
      </div>
    </div>
  );
}
