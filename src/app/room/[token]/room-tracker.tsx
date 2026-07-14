"use client";

import { useEffect } from "react";

// Client-side engagement beacon. room_open + work_view fire from HERE (a real
// browser executing JS), NEVER from the server render — an email link-scanner or
// unfurl bot fetches the HTML only and won't run this, so first_viewed_at and the
// M2 signal stay honest. work_view dedups to one per work per PAGE LOAD via an
// in-component Set (a repeat visit is a new load and intentionally makes new rows —
// that's the repeat-engagement signal). Fires when a work scrolls into view.
export function RoomTracker({ token }: { token: string }) {
  useEffect(() => {
    const base = `/api/room/${encodeURIComponent(token)}/event`;
    const post = (body: Record<string, unknown>) => {
      // keepalive so a view fired just before navigation still lands.
      void fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        keepalive: true,
      }).catch(() => {});
    };

    post({ event_type: "room_open" });

    const seen = new Set<string>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const id = e.target.getAttribute("data-artwork-id");
          if (id && !seen.has(id)) {
            seen.add(id);
            post({ event_type: "work_view", artwork_id: id });
          }
          io.unobserve(e.target);
        }
      },
      { threshold: 0.4 },
    );
    document
      .querySelectorAll<HTMLElement>("[data-artwork-id]")
      .forEach((el) => io.observe(el));

    return () => io.disconnect();
  }, [token]);

  return null;
}
