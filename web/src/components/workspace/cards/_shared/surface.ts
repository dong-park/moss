/** 카드 표면: /cards/v2/{kind}.png 알파를 그대로 사용한다. contain으로 비율 유지(잘림 0). */
export const cardSurface = (kind: string) => ({
  background: `url("/cards/v2/${kind}.png") center/contain no-repeat`,
});
