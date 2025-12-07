"use client";

import dynamic from 'next/dynamic';

const DynamicGameContainer = dynamic(() => import('./GameContainer'), {
  ssr: false,
});

export default function ClientGameContainer() {
  return <DynamicGameContainer />;
}
