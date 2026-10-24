def run(input, tent):
    kept = tent.progress()
    if kept is None:
        tent.save_progress([1, 2])
        raise tent.Back()
    return kept + [3]
