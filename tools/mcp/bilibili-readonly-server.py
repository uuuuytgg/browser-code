from pathlib import Path
import sys

VENDOR_DIR = Path(__file__).resolve().parent / "adoresever-bilibili-mcp"
sys.path.insert(0, str(VENDOR_DIR))

from mcp.server.fastmcp import FastMCP
from mcp_server import (
    bili_comments as _bili_comments,
    bili_crawl as _bili_crawl,
    bili_danmaku as _bili_danmaku,
    bili_favorite_content as _bili_favorite_content,
    bili_favorite_lists as _bili_favorite_lists,
    bili_hot_buzzwords as _bili_hot_buzzwords,
    bili_hot_videos as _bili_hot_videos,
    bili_rank as _bili_rank,
    bili_search as _bili_search,
    bili_subtitle as _bili_subtitle,
    bili_user_info as _bili_user_info,
    bili_user_videos as _bili_user_videos,
    bili_video_info as _bili_video_info,
    bili_weekly_hot as _bili_weekly_hot,
)

mcp = FastMCP("browsercode-bilibili-readonly")


@mcp.tool()
async def bili_search(keyword: str, num: int = 10, order: str = "totalrank") -> str:
    return await _bili_search(keyword=keyword, num=num, order=order)


@mcp.tool()
async def bili_comments(bvid: str, num: int = 30) -> str:
    return await _bili_comments(bvid=bvid, num=num)


@mcp.tool()
async def bili_subtitle(bvid: str) -> str:
    return await _bili_subtitle(bvid=bvid)


@mcp.tool()
async def bili_danmaku(bvid: str, num: int = 100) -> str:
    return await _bili_danmaku(bvid=bvid, num=num)


@mcp.tool()
async def bili_video_info(bvid: str) -> str:
    return await _bili_video_info(bvid=bvid)


@mcp.tool()
async def bili_crawl(keyword: str, max_videos: int = 5, comments_per_video: int = 20, get_subtitles: bool = True) -> str:
    return await _bili_crawl(
        keyword=keyword,
        max_videos=max_videos,
        comments_per_video=comments_per_video,
        get_subtitles=get_subtitles,
    )


@mcp.tool()
async def bili_hot_videos(pn: int = 1, ps: int = 20) -> str:
    return await _bili_hot_videos(pn=pn, ps=ps)


@mcp.tool()
async def bili_hot_buzzwords(page_num: int = 1, page_size: int = 20) -> str:
    return await _bili_hot_buzzwords(page_num=page_num, page_size=page_size)


@mcp.tool()
async def bili_weekly_hot(week: int = 0) -> str:
    return await _bili_weekly_hot(week=week)


@mcp.tool()
async def bili_rank(category: str = "all", day: int = 3) -> str:
    return await _bili_rank(category=category, day=day)


@mcp.tool()
async def bili_user_info(uid: int) -> str:
    return await _bili_user_info(uid=uid)


@mcp.tool()
async def bili_user_videos(uid: int, pn: int = 1, ps: int = 30, order: str = "pubdate", keyword: str = "") -> str:
    return await _bili_user_videos(uid=uid, pn=pn, ps=ps, order=order, keyword=keyword)


@mcp.tool()
async def bili_favorite_lists(uid: int = 0) -> str:
    return await _bili_favorite_lists(uid=uid)


@mcp.tool()
async def bili_favorite_content(media_id: int, page: int = 1, keyword: str = "") -> str:
    return await _bili_favorite_content(media_id=media_id, page=page, keyword=keyword)


if __name__ == "__main__":
    mcp.run(transport="stdio")
