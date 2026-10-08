# Background removal photograph fixture

`astronaut.png` shows NASA astronaut Eileen Collins. This photograph is released
into the public domain, with no known copyright restrictions.

- Original NASA collection: https://flic.kr/p/r9qvLn
- License/provenance: https://scikit-image.org/docs/stable/api/skimage.data.html#skimage.data.astronaut
- Fixture distribution: https://raw.githubusercontent.com/scikit-image/scikit-image/v0.19.3/skimage/data/astronaut.png

It exercises local semantic foreground removal against a varied photographic
background, so a solid-corner-color remover cannot satisfy the regression.
