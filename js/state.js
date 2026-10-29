'use strict';

/* ═══════════════════════════════════════════════════════════
   D. 상태
   ═══════════════════════════════════════════════════════════ */
const S = {
  img:null, src:null, analysis:null, regions:[], compared:false,
  overlay:true, alpha:.55, scans:[], simple:false,
  acc:null, masterRaw:null, masterKey:null, email:'', name:'', guest:false
};
const flow = { purpose:null, id:'', email:'', pw:'', acc:null };
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
