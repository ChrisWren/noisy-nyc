"use client";

import dynamic from "next/dynamic";

const ComplaintMap = dynamic(() => import("@/components/ComplaintMap"), {
  ssr: false,
});

export default function ComplaintMapClient() {
  return <ComplaintMap />;
}
