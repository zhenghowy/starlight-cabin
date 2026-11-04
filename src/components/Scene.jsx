export function Scene({ scene, levelWord, caption = true }) {
  if (!scene) return null
  const stars = Array.from({ length: 12 }, (_, i) => i)
  const cones = Array.from({ length: scene.cones }, (_, i) => i)

  return (
    <div className="scene-wrap">
      <div className="scene" aria-hidden="true">
        <div className="sky">
          {stars.map((i) => (
            <span
              key={i}
              className="star"
              style={{
                opacity: scene.starOpacity,
                left: `${(i * 37 + 11) % 92}%`,
                top: `${(i * 23 + 7) % 58}%`,
                animationDelay: `${i * 0.4}s`
              }}
            />
          ))}
          <span className="moon" />
        </div>
        <div className="ground" />
        <div className="hill hill-back" />
        <div className="hill hill-front" />

        <div className="cabin">
          <div className="roof" />
          <div className="wall">
            <div className="window" style={{ opacity: scene.lightOpacity }} />
            <div className="door" />
          </div>
          <div className="chimney" />
          <div className="smoke" style={{ opacity: scene.lightOpacity }} />
        </div>

        <div className="tree" style={{ left: '56em', bottom: '120em' }}>
          <div className="trunk" style={{ height: `${scene.treeHeight}em` }} />
          <div
            className="crown"
            style={{
              width: `${scene.foliage}em`,
              height: `${scene.foliage}em`,
              bottom: `${scene.treeHeight - 10}em`
            }}
          />
          <div
            className="crown crown-2"
            style={{
              width: `${scene.foliage * 0.7}em`,
              height: `${scene.foliage * 0.7}em`,
              bottom: `${scene.treeHeight + scene.foliage * 0.35}em`
            }}
          />
        </div>

        <div className="tree tree-small" style={{ right: '48em', bottom: '120em' }}>
          <div className="trunk" style={{ height: `${scene.treeHeight * 0.6}em` }} />
          <div
            className="crown"
            style={{
              width: `${scene.foliage * 0.62}em`,
              height: `${scene.foliage * 0.62}em`,
              bottom: `${scene.treeHeight * 0.6 - 8}em`
            }}
          />
        </div>

        <div className="camp" style={{ width: `${scene.campWidth}em` }} />

        <div className="cones-pile">
          {cones.map((i) => (
            <span key={i} className="pinecone" style={{ left: `${i * 22}em`, bottom: `${(i % 2) * 10}em` }} />
          ))}
        </div>

        {caption ? <p className="scene-caption">这里有一{levelWord}，正在慢慢长大</p> : null}
      </div>
    </div>
  )
}
