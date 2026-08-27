(() => { try { fetch('/api/track',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'page_view',path:location.pathname}),keepalive:true}); } catch {} })();
