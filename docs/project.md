# Description
A 3d hockey decision game 
to train decision in game play simulation.


# Tech stack
- Vite
- Vue.js
- three.js
- php

# Repo root structure
```
- ./docs
- ./host
- ./app
- ./server
```


# Backend ->  `./server`

Php based.
Stored data will be in json files, NO Database.

```
- ./server
    - files ".php"
    - ./storage
        - game1.json
        - game2.json
```

I documented already the php local start comand in `docs/usage.md`


# Frontend ->  `./app`
Vue based.
Will be deployed in a sud-directory with asubdomain, so modify the vite.config path.
Logic remains in Js Service-domain layer with reactive stored variables in service.
Vue-components responsability in visualization layer.
Services responsability data and logic layer.
Inject a Service-Register as door between components and services in the App.

Styles asr based in scss with B.E.M notation.
Keep component vue and component.scss separted in same directory, so components script remains with lees line-number.

Create a basic ./styles directory for the common scss files: reset, layout, css variables, fonts.

```
App.vue
./styles
./config
    - rink-dimensions.js
./views/

    - ./SimulationView
        - SimulationView.vue
        - SimulationView.scss 
        - ./partials
            - ...
    - ./EditorView
        - EditorView.vue
        - EditorView.scss
        - ./partials
            - ./Button
                - Button.vue
                - Button.scss
            - ...
./services
    - SimulationService.js
    - EditorService.js
```

# App
The aplication show a 3d hockey rink and based on the selected game.json file, recreates a game situation for the user.
The camera is in first person, eye heigh level camera. Player figures are distrubuted around the rink.
As a hockey game there are 2 teams, and some player has possession of the ball.
The Task in each game situation is to decided wich is the best reaction/move/decission.

## Game Data

Each game data has:
- the players in game coordinates
- wich player has ball possession
- wich player is the "first person" camera coordinate
- best decission response: player-id, action-id: run, pass,...
- slots: place whre the user can move, should be placed


## SimulationView
A full-screen browser 3d rendered view of a rink.
Players are 2d png sprites file with transparency images of players.
A player component loads the sprite in a coordinate to just display one player of the sprite, based on team property.

By open a game, players are positioned in the rink, based on teams colors sprite.

Action:
- button "protect"
- "pass" action means click on a player shape
- "move" action means click on a slot shape in floor

The time that the user need to make a decision will be measured, from the moment that the game situation changed.

Controls:
- 2d view toogle
- "RESOLVE": show the best option
  - make a outline if is a player
  - fill slot shape
  - show text "protect" centered in view
- "NEXT": load next randomly game available

Visual Elements:
- Name: game situation name is displayed in the top corner, for debugging
- 2d rink visualization: a small 2d top camera representation of the game, a simple rectangle, with filled dots for players and ball


Camera controls:
the user should be posible to look around the rink, eye height but not completly free movement rotation, just limited to left right:
L <--- 0°  ----> R ,  maximal 120°

ASSETS sprites docs/assets should be placed in the public frontend directory.

VIEWPORT
Human vision is relative wide. 
The User can extend the browser size to more than 1 monitor.
By scale the viewport dimention should be re-positioned the players/rink.

3D and Three.js
Create a neutral scene where 2d shape load a region of the sprite, with displaying the png alpha.
Player shapes always look to the first player direction.
Create circles on the floor for the slots.
Make slots circle shapes and players clickables.
Create a proportional circle for the ball,
create a circla in floor under the player that has posesion: opacity red for guest, black for home players

## EditorView
Allows the editor to create/Edit/delet game situations .json files
The view consist:
- svg  rink where players can be dragged
- svg dots for players

Players dots:
- home_golie, home_1, home_2, home_3, home_4
- guest_golie, guest_1, guest_2, guest_3, guest_4

By click on "select" button of player, is drag in svg activated

form fields:
- player possession: select dropdown: guest_1, ...
- player camera: select dropdown
- name
- short_description
- num_players dropdow: goalie + 3,4,5: possible values: 3,4,5
- Slots Regions:
  - loop of group fields: x,y

API Actions:
- create
- load file: dropdown contains a list of all created game json files
- delete
- save data

## Game Data Example

Coordinates x and 1 are normalized values from -1 to 1. Being 0 the center of the field/rink
Then in the app a mapping change the value to the rink dimension, Width and Height can be diferents
Stored in `rink-dimensions.js`
Width -> x coordinate
Height -> y coordinate

```
{
"name":"",
"short_description":"",
players:[
    {
        id:"goalie_home",
        x: -1,
        y: 0.5
    }
],
ball:{
    x: -1,
    y: 0.5
},
"camera_player_id":"home_1",
"possession_player_id":"home_1",
"slots":[
    {
        id:"slot_1",
        x: -1,
        y: 0.5
    }
],

}
```

RINK dimension config 

- Array of different rinks dimensions