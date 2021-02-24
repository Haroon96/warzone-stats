import moment = require("moment");
import { Duration, GameMode, Player } from "../common/types";
import { DAL } from "../dal/mongo-dal";
import { request } from "../utilities/util";

const modeIds = {};

export async function getPlayerProfile(platform: string, username: string): Promise<Player> {
    let url = `https://api.tracker.gg/api/v2/warzone/standard/profile/${platform}/${encodeURIComponent(username)}`;
    let res = await request(url);
    return res.errors ? null : {
        playerId: res.data.platformInfo.platformUserIdentifier,
        platformId: res.data.platformInfo.platformSlug,
        avatarUrl: res.data.platformInfo.avatarUrl
    }
}

export async function getRecentMatches(player: Player, duration: Duration, mode: GameMode) {
    let now = moment();
    let recentMatches = [];

    let next = 'null';

    // check if modeIds loaded, else load from db
    if (!modeIds[mode]) modeIds[mode] = await DAL.getModeIds(mode);

    // fetch all matches during specified duration
    while (true) {

        // get matches from tracker.gg api
        let url = `https://api.tracker.gg/api/v1/warzone/matches/${player.platformId}/${encodeURIComponent(player.playerId)}?type=wz&next=${next}`;
        let res = await request(url);

        if (res.errors) {
            let err = res.errors[0];    
            if (err.code == 'WzMatchService::ApiUnavailable') {
                // end of match list for this user
                return recentMatches;
            } else {
                // some other error, inform user
                throw { msg: err.message, code: err.code };
            }
        }

        let matches = res.data.matches;

        // filter out matches of other types
        matches = matches.filter(x => modeIds[mode].includes(x.attributes.modeId));

        // filter to only today's matches
        let filteredMatches = matches.filter(x => now.diff(x.metadata.timestamp, duration.unit) < duration.value);
        
        // append filtered matches to todays list
        recentMatches.push(...filteredMatches);

        // stop if reached duration limit or all matches
        if (filteredMatches.length < matches.length) {
            break;
        }

        // setup for next query
        next = res.data.metadata.next;
    }

    return recentMatches;
}