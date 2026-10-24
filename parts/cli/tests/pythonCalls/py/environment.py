import os
import sys


def run(input, tent):
    return {
        "names": sorted(os.environ),
        "cards": os.environ.get("CUDA_VISIBLE_DEVICES"),
        "key": "TENT_SECRET_KEY" in os.environ,
        "path": sys.path,
        "userSite": sys.flags.no_user_site,
        "disk": os.path.isdir(tent.disk),
    }
