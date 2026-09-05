# Montage-CaniPlus — lancer un nouveau montage

1. Première fois seulement : copie ce dossier dans `C:\Users\tiffa\Documents\Montage-CaniPlus\`, installe [Node.js 22+](https://nodejs.org) et [FFmpeg](https://ffmpeg.org) (`winget install ffmpeg`), puis lance `npx skills add heygen-com/hyperframes` dans le dossier.
2. Crée un dossier `video-projects/mon-tip/rush/` et déposes-y ta vidéo brute.
3. Ouvre un terminal dans `Montage-CaniPlus\` et lance `claude`.
4. Copie-colle ce prompt : **« Nouvelle vidéo : monte le rush dans video-projects/mon-tip/ selon le format tip-vertical. Transcris, propose le plan de montage et rends une V1 draft. »**
5. Claude transcrit, coupe, pose sous-titres + hook + outro, et te sort une V1 draft dans `video-projects/mon-tip/renders/`.
6. Donne tes retours avec timecodes (« à 0:23, le cut est trop lent ») ; Claude fait la V2 puis le rendu final pleine qualité.

Les règles permanentes (charte, coupes, −14 LUFS, 9:16…) sont dans `CLAUDE.md` : Claude les applique tout seul à chaque vidéo.
