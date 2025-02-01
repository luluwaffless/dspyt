import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileTypeFromBuffer } from 'file-type';
import { dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import youtubedl from 'youtube-dl-exec';
import promptSync from 'prompt-sync';
import YTMUSIC from 'ytmusic-api';
import NodeID3 from 'node-id3';
import express from 'express';
import dotenv from 'dotenv';
import chalk from 'chalk';
import axios from 'axios';
dotenv.config();

const stringify = (data) => new URLSearchParams(data).toString();

let queries = JSON.parse(readFileSync("queries.json", "utf8"));
const saveQueries = () => writeFileSync("queries.json", JSON.stringify(queries));

const ytapi = new YTMUSIC();
const prompt = promptSync();
const __dirname = dirname(fileURLToPath(import.meta.url));
let session = {};

const removeInvalidCharacters = (str) => str.replace(/\\|\/|\:|\*|\?|\"|\<|\>|\|/g, '');

const downloadPng = async (url, outputPath) => {
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data, 'binary');
        writeFileSync(outputPath, buffer);
    } catch (error) {
        console.error(`${chalk.red("[ERROR]")} Failed to download image: ${error.message}`);
    }
};

const parseResults = (results) => {
    return results.map((result, index) => 
        `${index + 1}. ${chalk.greenBright(`${result.name} - ${result.artist.name} (${result.album.name})`)} (${chalk.blueBright("https://www.youtube.com/watch?v=" + result.videoId)})`
    ).join('\n');
};

const adapt = (str) => str.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^\p{L}\p{N} ]/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
const getMusicMatch = async (results, title, artist, album, searchQuery) => {
    for (const result of results) {
        if (adapt(result.name) === adapt(title) && adapt(result.artist.name) === adapt(artist) && adapt(result.album.name) === adapt(album)) {
            if (!queries[searchQuery]) {
                queries[searchQuery] = result.videoId;
                saveQueries();
            }
            return result.videoId;
        }
    }
    console.log(`${chalk.yellow("[WARN]")} No exact match found for ${chalk.greenBright(searchQuery)}. Review the alternatives:\n${parseResults(results)}`);
    const choice = prompt(`${chalk.blue("[INPUT]")} Enter your choice, a video ID if not listed, or press ENTER to choose the first: `);
    const selectedResult = results[Number(choice) - 1] || results[0];
    const videoId = choice && isNaN(choice) ? choice : selectedResult.videoId;
    if (!queries[searchQuery]) {
        queries[searchQuery] = videoId;
        saveQueries();
    }
    return videoId;
};

const downloadTrack = async (track) => {
    const searchQuery = `${track.name} - ${track.artist} (${track.album})`;
    const output = normalize(`${__dirname}/downloaded/${session.playlistName}/${removeInvalidCharacters(track.name)}.mp3`);
    if (existsSync(output)) {
        console.log(`${chalk.yellow("[WARN]")} ${chalk.greenBright(searchQuery)} (${chalk.blueBright(output)}) already exists, skipping.`);
        return { skipped: true };
    }
    if (session.searchQueries.includes(searchQuery)) {
        console.log(`${chalk.yellow("[WARN]")} ${chalk.greenBright(searchQuery)} already searched, skipping.`);
        return { skipped: true };
    }
    session.searchQueries.push(searchQuery);
    let videoId = queries[searchQuery];
    if (!videoId) {
        const results = await ytapi.searchSongs(searchQuery);
        videoId = await getMusicMatch(results, track.name, track.artist, track.album, searchQuery);
    }
    console.log(`${chalk.redBright("[DOWNLOAD]")} Downloading ${chalk.greenBright(searchQuery)} (${chalk.blueBright("https://www.youtube.com/watch?v=" + videoId)})`);
    try {
        await youtubedl(`https://www.youtube.com/watch?v=${videoId}`, {
            extractAudio: true,
            audioFormat: "mp3",
            output: output
        });
        console.log(`${chalk.greenBright("[TAG]")} Tagging ${chalk.blueBright(output)} (${chalk.greenBright(searchQuery)})`);
        const response = await axios.get(track.img, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data, "utf-8");
        const mime = await fileTypeFromBuffer(buffer);
        NodeID3.write({
            title: track.name,
            artist: track.artist,
            album: track.album,
            image: {
                mime: mime.mime,
                type: { id: 3 },
                description: "",
                imageBuffer: buffer
            }
        }, output);
        console.log(`${chalk.green("[SUCCESS]")} ${chalk.blueBright(output)} complete (${chalk.greenBright(searchQuery)})`);
        return { skipped: false, output };
    } catch (error) {
        console.error(`${chalk.red("[ERROR]")} Failed to download or tag track: ${error.message}`);
        return { skipped: false, error };
    }
};

let refreshToken = null;
let accessToken = null;

const getAccessToken = async () => {
    if (!refreshToken) {
        throw new Error("No refresh token available");
    }
    const response = await axios.post('https://accounts.spotify.com/api/token', stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
    }), {
        headers: {
            'Authorization': 'Basic ' + Buffer.from(`${process.env.id}:${process.env.secret}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    });
    accessToken = response.data.access_token;
    return accessToken;
};

const authenticateSpotify = async () => {
    const app = express();
    app.use(express.json());
    app.get('/', (_, res) => {
        res.redirect('https://accounts.spotify.com/authorize?' + stringify({
            response_type: 'code',
            client_id: process.env.id,
            scope: 'playlist-read-private playlist-read-collaborative',
            redirect_uri: "http://localhost:5000/callback",
        }));
    });
    app.get('/callback', async (req, res) => {
        res.type("text/html").send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta http-equiv="X-UA-Compatible" content="IE=edge"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>dspyt</title></head><body style="background-color: #191414; color: #1ed760; text-align: center; font-family: monospace; font-weight: bold; font-size: xx-large;"><div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);"><span>you can now return to the terminal</span></div></body></html>`);
        const code = req.query.code;
        if (session.loggedIn) {
            console.log(`${chalk.yellow("[WARN]")} You are already logged in.`);
            return;
        }
        try {
            const authResponse = await axios.post('https://accounts.spotify.com/api/token', stringify({
                code: code,
                redirect_uri: "http://localhost:5000/callback",
                grant_type: 'authorization_code'
            }), {
                headers: {
                    'Authorization': 'Basic ' + Buffer.from(`${process.env.id}:${process.env.secret}`).toString('base64'),
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
            session.loggedIn = true;
            refreshToken = authResponse.data.refresh_token;
            accessToken = authResponse.data.access_token;
            console.log(`${chalk.green("[SUCCESS]")} Logged in successfully.`);
            await processPlaylist();
        } catch (error) {
            console.error(`${chalk.red("[ERROR]")} Login error: ${error.message}`);
            process.exit();
        }
    });
    app.get('/session', (_, res) => res.json(session));
    app.listen(5000, () => {
        console.log(`${chalk.green("[SUCCESS]")} Authentication link generated. Go to http://localhost:5000 to log in.`);
    });
};

const processPlaylist = async () => {
    try {
        if (!session.playlistName) {
            const playlistData = await axios.get(`https://api.spotify.com/v1/playlists/${session.playlist}`, {
                headers: { 'Authorization': 'Bearer ' + accessToken }
            });
            if (playlistData.status === 200) {
                const tracks = playlistData.data.tracks.total;
                const requests = Math.ceil(tracks / 100);
                console.log(`${chalk.green("[SUCCESS]")} Playlist "${playlistData.data.name}" by ${playlistData.data.owner.display_name} with ${tracks} track${tracks === 1 ? '' : 's'} (${requests} request${requests === 1 ? '' : 's'}) retrieved successfully.`);
                session.playlistName = removeInvalidCharacters(playlistData.data.name);
                if (!existsSync(normalize(`${__dirname}/downloaded/${session.playlistName}`))) {
                    mkdirSync(normalize(`${__dirname}/downloaded/${session.playlistName}`));
                }
                await downloadPng(playlistData.data.images[0].url, normalize(`${__dirname}/downloaded/${session.playlistName}/cover.png`));
            } else {
                console.error(`${chalk.red("[ERROR]")} Failed to retrieve playlist.`);
                process.exit();
            }
        }

        if (!session.results) {
            session.results = { total: 0, completed: 0, tagError: 0, downloadError: 0, skipped: 0 };
            session.searchQueries = [];
        }

        let nextUrl = session.nextUrl || `https://api.spotify.com/v1/playlists/${session.playlist}/tracks`;
        console.log(`${chalk.cyan("[DEBUG]")} Fetching tracks from: ${nextUrl}`);
        
        while (nextUrl) {
            const playlistTracks = await axios.get(nextUrl, {
                headers: { 'Authorization': 'Bearer ' + accessToken }
            });
            for (const item of playlistTracks.data.items) {
                const result = await downloadTrack({
                    artist: item.track.artists[0].name,
                    name: item.track.name,
                    album: item.track.album.name,
                    img: item.track.album.images[0].url
                });
                session.results.total++;
                if (result.skipped) {
                    session.results.skipped++;
                } else if (result.error) {
                    session.results.downloadError++;
                } else {
                    session.results.completed++;
                }
            }
            nextUrl = playlistTracks.data.next;
            session.nextUrl = nextUrl;
        }

        console.log(`${chalk.greenBright("[DONE]")} Download completed! You can find the tracks in the /downloaded directory.\nResults: ${chalk.white("Total")}: ${session.results.total}; ${chalk.green("Completed")}: ${session.results.completed}; ${chalk.yellow("Skipped")}: ${session.results.skipped}; ${chalk.red("Download Error")}: ${session.results.downloadError}; ${chalk.red("Tag Error")}: ${session.results.tagError}.`);
        process.exit();
    } catch (error) {
        if (error.response && error.response.status === 401) {
            console.log(`${chalk.yellow("[INFO]")} Access token expired, refreshing...`);
            accessToken = await getAccessToken();
            await processPlaylist();
        } else {
            console.error(`${chalk.red("[ERROR]")} Error processing playlist: ${error.message}`);
            process.exit();
        }
    }
};

(async () => {
    await ytapi.initialize();
    if (!existsSync(normalize(`${__dirname}/downloaded/`))) mkdirSync(normalize(`${__dirname}/downloaded/`));
    let playlistValid = false;
    while (!playlistValid) {
        try {
            const input = prompt(`${chalk.blue("[INPUT]")} Enter your Spotify playlist URL: `);
            const playlist = new URL(input);
            const path = playlist.pathname.split("/");
            const type = path[path.length - 2];
            const id = path[path.length - 1];
            if (playlist.hostname === "open.spotify.com" && type === "playlist" && id.length === 22) {
                playlistValid = true;
                session.playlist = id;
                console.log(`${chalk.green("[SUCCESS]")} Playlist URL accepted.`);
            } else {
                console.log(`${chalk.yellow("[WARN]")} Please enter a valid URL.`);
            }
        } catch (error) {
            console.log(`${chalk.red("[ERROR]")} Please enter an actual URL.`);
        }
    }
    await authenticateSpotify();
})();