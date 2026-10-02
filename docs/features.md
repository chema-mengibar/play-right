
Service:
app/src/services/AnalyticsService.js


IDEAS Features to do:

1.Passing lanes Draw lines from the camera/possession player to teammates. Color them:
•green: clear lane
•yellow: partially blocked
•red: blocked by opponent area/player radius
2.Danger zone / shot cone For the player with the puck, draw a cone toward the opponent goal. Highlight defenders inside the cone. This would pair well with your existing shot-line visualization.
3.Nearest pressure Draw circles or labels showing the nearest opponent distance for each player. Useful for deciding if Protect, Shot, or pass is better.
4.Team compactness Show each team polygon plus a center point. Display area size in m². Smaller area means compact defense/offense, larger means spread out.
5.Open space heat map Generate a low-res grid over the rink and color cells by distance from opponents. Good for identifying safe pass targets or skating lanes.
6.Goalie coverage cone From the goalie, draw a coverage wedge toward the puck/camera player and goal posts. Could show if goalie angle/depth is correct.
7.Expected shot quality Simple heuristic overlay:
•distance to goal
•angle to posts
•goalie lateral/depth alignment Then display a small score like Shot quality: 62%.