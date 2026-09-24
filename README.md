# Lopes Web Studio — site institucional

Site do meu estúdio de desenvolvimento (apps, sistemas e SaaS sob medida).

**Ao vivo:** [lopeswebstudio.com.br](https://www.lopeswebstudio.com.br)

![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black)
![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?logo=supabase&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?logo=vercel&logoColor=white)

## Destaques

- **Site estático e leve**, sem framework, com assets minificados e deploy na Vercel.
- **Internacionalização** no cliente (`js/i18n.js`).
- **PWA:** manifest e service worker (`sw.js`).
- **Alertas de visita em tempo real:** o `js/visit-tracker.js` registra sessões (filtrando bots e crawlers) e dispara uma **Supabase Edge Function** ([`supabase/functions/lws-notify`](supabase/functions/lws-notify/index.ts)). A função envia **Web Push (VAPID)** para os dispositivos inscritos na página [`avisos.html`](avisos.html) e remove automaticamente as inscrições expiradas.

## Estrutura

```
index.html                     # página principal
avisos.html                    # painel para ativar alertas push de visitas
css/ js/ imagens/ fonts/       # assets
sw.js                          # service worker (push + PWA)
supabase/functions/lws-notify  # Edge Function (Deno) de Web Push
```

**Autor:** Daniel Lopes — [GitHub](https://github.com/daniellpsadm-boop)
