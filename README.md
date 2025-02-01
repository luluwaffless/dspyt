# <p align="center">dspyt 🎶 [![forthebadge](https://forthebadge.com/images/badges/made-with-javascript.svg)](https://forthebadge.com)</p>
<p align="center"><img src="https://raw.githubusercontent.com/luluwaffless/dspyt/refs/heads/main/downloaded/cover.png"></p>
<hr>

a script to easily download your spotify playlist from youtube
# requirements 📚
- [node.js & npm](https://nodejs.org/)
- [ffmpeg](https://ffmpeg.org/)
- [python](https://www.python.org/)
# how to use 💻
1. go to the [spotify developer dashboard](https://developer.spotify.com/dashboard/), create a new app, set the redirect URI as `http://localhost:5000/callback` and paste the client's ID and secret onto the `.env` file
2. download the requirements and clone the repository using ```git clone https://github.com/luluwaffless/dspyt.git && cd dspyt``` (or download directly from github)
3. on the repository's terminal, use the command `npm i`
4. start the script with `npm start` or `node .`
5. insert your spotify playlist URL, it should have 56 characters and start with `https://open.spotify.com/playlist/`
6. go to `http://localhost:5000` where you'll be redirected to login with spotify
7. after that, the playlist will start downloading, if a song does not have a specific match in youtube, you'll be prompted to select one
8. just sit back, relax, and wait for the playlist to download, it should be in `/downloaded` afterwards
# how to use (in an android device) 📱
- warning: this script was made to run on computers and may have problems with downloading!
1. download [termux](https://github.com/termux/termux-app/releases/latest)
2. use the following commands:
```sh
pkg update && pkg upgrade
pkg install git
pkg install nodejs
pkg install ffmpeg
pkg install python
```
3. follow the PC steps
4. use the following commands to move the playlist from the terminal to the storage's music folder (replace `{PLAYLIST_NAME}` with your actual playlist name):
```sh
termux-setup-storage
mv /{PLAYLIST_NAME}/* ~/storage/music/
```
5. use your favorite media player to play your playlist
