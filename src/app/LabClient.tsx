'use client';
// The lab is browser-only (WebGL map, drawing, web worker), so it is loaded without server rendering.
import dynamic from 'next/dynamic';
const App = dynamic(() => import('../lab/App'), { ssr: false, loading: () => <div className="loading">Loading the boundary lab…</div> });
export default function LabClient() { return <div id="root"><App /></div>; }
