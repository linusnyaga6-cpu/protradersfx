(async()=>{
  const payload={type:'page_view',path:location.pathname};
  try{await fetch('/api/track',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),keepalive:true})}catch{}
  const p=new URLSearchParams(location.search);
  if(p.get('logged_in')==='1') alert('You are now signed in with your existing Deriv account.');
  if(p.get('registered')==='1') alert('Your new Deriv account registration was completed.');
  if(p.get('oauth_error')) alert('We could not complete the Deriv authentication flow. Please try again.');
})();
