// ==========================================
// ILLUSION — L'IMMEUBLE VU PAR LES PNJ (building-feature.js)
// ==========================================
// Déclare, une seule fois, tout ce que les avatars ont besoin de savoir de l'immeuble :
//   • où se tenir dans le hall, l'ascenseur et le couloir (point `at`, repère de l'immeuble)
//   • les objets utilisables : porte d'entrée, boutons d'appel (hall, couloir), boutons de la cabine
//   • quand on peut entrer dans la cabine (elle est là, portes ouvertes) -> `canEnter`
// Rien n'est à décrire dans context.txt : le cerveau lit « Objects here : ... actions : ... » dans le registre.
// Un nouveau lieu fait pareil dans son propre fichier (places + objects + at), sans toucher à society.js.
//
// All text the avatars can read stays in English.

export function registerBuilding(c) {

  const rdc = c.rdc, elevator = c.elevator, car = elevator.state;
  const LV0 = c.LEVEL_Y[0], LV6 = c.LEVEL_Y[6];
  const FLOOR_OF = { lobby: 0, corridor: 6 };
  const CAB_Z = c.ELEV_Z - 1.3;                       // centre de la cabine (voir elevator.js : ZC)

  // Repère partagé avec avatar-body.js
  const I = window.BadTherapistInterior = {
    parent: c.scene,
    streetDX: c.STREET_DX, streetZ: c.STREET_Z,
    doorZ: rdc.doorZ,
    inner: { x: 0, z: rdc.doorZ - 0.5 },                       // juste derrière la porte, côté hall
    outer: { x: 0, z: rdc.doorZ - c.STREET_Z + 0.6 },          // juste devant la porte, côté rue (repère de la rue)
    npcs: {}
  };

  // ---------- Points de passage (repère de l'immeuble) ----------
  const AT = {
    lobby:    { x: 0, y: LV0, z: c.ELEV_Z + 6, heading: Math.PI },
    corridor: { x: 0, y: LV6, z: c.ELEV_Z + 4, heading: Math.PI },
    elevator: function() { return { x: 0, y: elevator.getCabY(), z: CAB_Z, heading: 0 }; }
  };

  function canEnter(id) {
    return function(actor, from) {
      if (id === 'elevator') {
        const fl = FLOOR_OF[from];
        if (fl === undefined) return 'You cannot get into the elevator from here.';
        if (car.level === fl && elevator.doorsOpen()) return null;
        return 'The elevator is not here with its doors open. Press its call button (use_object), wait for it, then try again.';
      }
      if (from === 'elevator') {
        if (car.level === FLOOR_OF[id] && elevator.doorsOpen()) return null;
        return 'You cannot get out: the elevator is not at that floor with its doors open.';
      }
      return null;
    };
  }

  // ---------- Objets ----------
  function press(floor) {
    return function() {
      if (car.level === floor && !car.moving) { elevator.requestFloor(floor); return 'The doors are opening.'; }
      elevator.requestFloor(floor);
      return 'You press the button. The elevator is on its way; wait until its doors open.';
    };
  }
  function floorBtn(floor) {
    return function() {
      if (car.moving) return 'The elevator is already moving.';
      if (car.level === floor) return 'You are already on that floor. Walk out (go_to).';
      elevator.requestFloor(floor);
      return 'The doors close. The elevator moves. When the doors open, walk out with go_to.';
    };
  }

  let S = null;
  function apply() {
    const R = S.registry;
    Object.keys(AT).forEach(function(id) {
      const p = R.place(id);
      if (!p) return;
      if (id === 'elevator') { if (typeof p.at !== 'function') p.at = AT.elevator; }
      else if (!p.at) p.at = AT[id];
      if (typeof p.canEnter !== 'function') p.canEnter = canEnter(id);
    });
    // « building » = l'immeuble en général : c'est le lieu par défaut (et sauvegardé) des avatars qui n'ont pas encore bougé.
    // Sans point `at`, ils y étaient invisibles : on les place dans le hall.
    const bd = R.place('building');
    if (bd && !bd.at) bd.at = AT.lobby;
    const fd = R.object('front_door');
    if (fd && !(fd.actions && fd.actions.open)) {
      fd.actions = { open: function() { return 'It is automatic: it opens by itself when you walk up to it. Nothing to press.'; } };
    }
    const eb = R.object('elevator_buttons');
    if (eb && !(eb.actions && eb.actions.floor_0 && eb.actions.press)) {
      eb.desc = 'floors 0 (ground) and 6 work';
      eb.actions = { floor_0: floorBtn(0), floor_6: floorBtn(6), press: function() { return floorBtn(car.level === 0 ? 6 : 0)(); } };
    }
    if (!R.object('lobby_call')) R.addObject({ id: 'lobby_call', name: 'elevator call button', place: 'lobby', actions: { press: press(0) } });
    if (!R.object('corridor_call')) R.addObject({ id: 'corridor_call', name: 'elevator call button', place: 'corridor', actions: { press: press(6) } });
    [['lobby_call', 0], ['corridor_call', 6]].forEach(function(x) {
      const o = R.object(x[0]);
      if (o && !(o.actions && o.actions.press)) o.actions = { press: press(x[1]) };
    });
  }

  // society.js peut se charger après nous : on attend, puis on vérifie de temps en temps
  // (si une sauvegarde du registre remettait des objets sans leurs fonctions, on les remet).
  (function wait() {
    S = window.BadTherapistSociety;
    if (!S || !S.registry || !S.registry.place('lobby')) { setTimeout(wait, 400); return; }
    apply();
    setInterval(apply, 4000);
    // Une seule fois : les anciens souvenirs écrits quand l'immeuble était « fermé » (porte verrouillée, ascenseur factice)
    // ne correspondent plus au monde et la faisaient recommencer les mêmes actions en boucle à chaque partie.
    try {
      if (localStorage.getItem('ill_building_v1') !== '1') {
        S.registry.actors().forEach(function(a) {
          if (a.isPlayer || !Array.isArray(a.memory)) return;
          a.memory = a.memory.filter(function(m) { return !/elevator|front_door|lobby|locked|door/i.test(String(m)); });
        });
        S.registry.save();
        localStorage.setItem('ill_building_v1', '1');
      }
    } catch (e) { /* tant pis */ }
  })();

  return {
    // Un PNJ est près de la porte d'entrée (hall ou rue) -> elle s'ouvre
    npcNearDoor: function() {
      const ids = Object.keys(I.npcs);
      for (let i = 0; i < ids.length; i++) {
        const n = I.npcs[ids[i]];
        const lx = n.x > 100 ? n.x - c.STREET_DX : n.x;
        if (Math.abs(lx) < 3.2 && Math.abs(n.z - rdc.doorZ) < 4.5 && (n.x > 100 || Math.abs(n.y - LV0) < 1.5)) return true;
      }
      return false;
    },
    // Un PNJ est dans l'embrasure de l'ascenseur (cabine ou palier) à cet étage -> les portes ne se referment pas
    npcInDoorway: function(level) {
      const ly = c.LEVEL_Y[level];
      const ids = Object.keys(I.npcs);
      for (let i = 0; i < ids.length; i++) {
        const n = I.npcs[ids[i]];
        if (!n.inside || ly === undefined || Math.abs(n.y - ly) > 1.2) continue;
        if (Math.abs(n.x) < 0.9 && n.z < c.ELEV_Z + 1.0 && n.z > c.ELEV_Z - 2.6) return true;
      }
      return false;
    }
  };
}
