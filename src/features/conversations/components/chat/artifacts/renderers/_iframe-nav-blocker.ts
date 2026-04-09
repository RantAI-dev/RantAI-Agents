/**
 * Shared navigation/escape blocker injected into HTML and React iframe
 * sandboxes. Both renderers used to carry their own near-identical copy of
 * this script — extracting it here prevents drift.
 *
 * What it blocks:
 *   - `Location.assign/replace/reload` and `location.href = ...`
 *   - clicks on non-fragment, non-`javascript:` anchor links
 *   - form submissions
 *   - `history.pushState/replaceState` to non-empty URLs
 *   - `window.open(...)` — returns a stub no-op window so callers that chain
 *     `.focus()` or `.postMessage(...)` don't crash.
 */
const WINDOW_OPEN_STUB = `(function(){
  function noop(){}
  return {closed:true,focus:noop,blur:noop,close:noop,postMessage:noop,location:{href:''}};
})()`

export const IFRAME_NAV_BLOCKER_SCRIPT = `<script>
Location.prototype.assign=function(){};
Location.prototype.replace=function(){};
Location.prototype.reload=function(){};
try{var _hd=Object.getOwnPropertyDescriptor(Location.prototype,'href');Object.defineProperty(Location.prototype,'href',{get:_hd?_hd.get:function(){return '';},set:function(){},configurable:true});}catch(e){}
try{var _cl=window.location;Object.defineProperty(window,'location',{get:function(){return _cl;},set:function(){},configurable:true});}catch(e){}
document.addEventListener('click',function(e){var a=e.target.closest('a');if(a){var h=a.getAttribute('href');if(h&&!h.startsWith('#')&&!h.startsWith('javascript:')){e.preventDefault();e.stopImmediatePropagation();}}},true);
document.addEventListener('submit',function(e){e.preventDefault();e.stopImmediatePropagation();},true);
var _p=history.pushState.bind(history),_r=history.replaceState.bind(history);
history.pushState=function(s,t){try{_p(s,t,'');}catch(e){}};
history.replaceState=function(s,t){try{_r(s,t,'');}catch(e){}};
window.open=function(){return ${WINDOW_OPEN_STUB};};
<\/script>`
