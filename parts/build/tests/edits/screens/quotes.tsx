import { screen, read } from "tentjs/ui";
import { openOrders } from "../functions/orders";

export const quotesScreen = screen("quotesScreen", {
	path: "/quotes",
	access: "signedIn",
	title: "Say \"hi\"",
	data: { orders: read(openOrders, { limit: 10 }) },
	view: ({ orders }) => (
		<div style={{ display: 'flex', flexDirection: 'row', gap: 4 }}>
			<span>It's "quoted" &amp; signed</span>
			{orders.map((o, i) => <span key={i}>{`${i + 1}. ${o.customer?.name ?? "nobody"}`}</span>)}
		</div>
	),
});

export const lastScreen = screen("lastScreen", {
	path: "/last",
	access: "anyone",
	view: () => (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
			<span>The last of its file, with no line end after it</span>
		</div>
	),
})