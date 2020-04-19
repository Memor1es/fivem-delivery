const webhook = require("./webhook");
const { sql, getTables } = require("./database");
const { isOnline } = require("../api");
const { after } = require("./scheduler");

class VRP {

  async unban(id) {
    await sql("UPDATE vrp_users SET banned=0 WHERE id=?", [id]);
    return true;
  }

  async addTemporaryPriority(days, id, level) {
    after(days, `vrp.removePriority("${id}", ${level})`)
    await this.addPriority(id, level);
  }

  async addPriority(id, level) {
    const hex = await sql("SELECT identifier FROM vrp_user_ids WHERE user_id=? AND identifier LIKE 'steam:%'", [id]);
    if (hex.length > 0) {
      await sql("REPLACE INTO vrp_priority (steam,priority) VALUES (?,?)", [hex[0].identifier, level]);
      return true;
    } else {
      webhook.debug('Não foi possível encontrar a steam hex do passport '+id, true);
      return false;
    }
  }

  async removePriority(id) {
    const hex = await sql("SELECT identifier FROM vrp_user_ids WHERE user_id=? AND identifier LIKE 'steam:%'", [id]);
    if (hex.length > 0) {
      await sql("DELETE FROM vrp_priority WHERE steam=?", [hex[0].identifier]);
      return true;
    } else {
      webhook.debug('Não foi possível encontrar a steam hex do passport '+id, true);
      return false;
    }
  }

  async addTemporaryGroup(days, id, group) {
    after(days, `vrp.removeGroup("${id}", "${group}")`);
    await this.addGroup(id, group);
  }

  async addGroup(id, group) {
    if (await isOnline(id)) return false;
    const res = await sql(
      "SELECT dvalue FROM vrp_user_data WHERE user_id='" +
        id +
        "' AND dkey='vRP:datatable'"
    );
    if (res.length > 0) {
      const data = JSON.parse(res[0].dvalue);
      webhook.debug("Grupos antigos: " + JSON.stringify(data.groups));
      if (Array.isArray(data.groups)) {
        data.groups = {};
      }
      data.groups[group] = true;
      await sql(
        "UPDATE vrp_user_data SET dvalue=? WHERE user_id=? AND dkey='vRP:datatable'",
        [JSON.stringify(data), id]
      );
      return true;
    } else {
      webhook.debug("Não foi encontrado nenhum dvalue para " + id);
      return false;
    }
  }

  async removeGroup(id, group) {
    if (await isOnline(id)) return false;
    const res = await sql(
      "SELECT dvalue FROM vrp_user_data WHERE user_id=? AND dkey='vRP:datatable'",
      [id]
    );
    if (res.length > 0) {
      const data = JSON.parse(res[0].dvalue);
      if (!Array.isArray(data.groups)) delete data.groups[group];
      sql(
        "UPDATE vrp_user_data SET dvalue=? WHERE user_id=? AND dkey='vRP:datatable'",
        [JSON.stringify(data), id]
      );
      return true;
    } else {
      webhook.debug("Não foi encontrado nenhum dvalue para " + id);
      return false;
    }
  }

  async addTemporaryHouse(days, id, house) {
    after(days, `vrp.removeHouse("${id}", "${house}")`);
    await this.addHouse(id, house);
  }

  async addHouse(id, house) {
    if (await isOnline(id)) return false;
    const highest = await sql(
      "SELECT MAX(number) AS `high` FROM vrp_user_homes WHERE home=?",
      [house]
    );
    let number = 1;
    if (highest.length > 0) number = highest[0].high + 1;
    await sql(
      "INSERT INTO vrp_user_homes (user_id,home,number) VALUES (?,?,?)",
      [id, house, number],
      true
    );
    return true;
  }

  async removeHouse(id, house) {
    if (await isOnline(id)) return false;
    await sql(
      "DELETE FROM vrp_user_homes WHERE user_id=? AND home=?",
      [id, house],
      true
    );
    return true;
  }

  async addTemporaryHousePermission(days, id, housePrefix) {
    after(days, `vrp.removeHousePermission("${id}", "${housePrefix}")`);
    await this.addHousePermission(id, housePrefix);
  }

  async addHousePermission(id, housePrefix) {
    if (await isOnline(id)) return false;
    const rows = await sql(
      `SELECT home FROM vrp_homes_permissions WHERE home LIKE '${housePrefix}%'`
    );
    let higher = 1;
    for (let row of rows) {
      const number = parseInt(row.home.substr(housePrefix.length));
      if (number >= higher) higher = number + 1;
    }
    higher = higher > 9 ? higher : "0" + higher;
    await sql(
      "INSERT INTO vrp_homes_permissions (user_id,home,owner,garage) VALUES (?,?,1,1)",
      [id, housePrefix + higher],
      true
    );
    return true;
  }

  async removeHousePermission(id, housePrefix) {
    if (await isOnline(id)) return false;
    await sql(
      `DELETE FROM vrp_homes_permissions WHERE user_id=? AND home LIKE '${housePrefix}%' AND owner>0`
    );
    return true;
  }

  async addTemporaryCar(days, id, car) {
    after(days, `vrp.removeCar("${id}", "${car}")`);
    return await this.addCar(id, car);
  }

  async addCar(id, car) {
    if (await isOnline(id)) return false;
    if (getTables().includes("vrp_vehicles")) {
      await sql(
        "INSERT INTO vrp_vehicles (user_id,vehicle) VALUES (?,?)",
        [id, car],
        true
      );
    } else {
      await sql(
        "INSERT INTO vrp_user_vehicles (user_id,vehicle) VALUES (?,?)",
        [id, car],
        true
      );
    }
    return true;
  }

  async removeCar(id, car) {
    if (await isOnline(id)) return false;
    await sql("DELETE FROM vrp_user_vehicles WHERE user_id=? AND vehicle=?", [
      id,
      car,
    ]);
    return true;
  }

  async addWallet(id, value) {
    if (await isOnline(id)) return false;
    await sql("UPDATE vrp_user_moneys SET wallet=wallet+? WHERE user_id=?", [
      value,
      id,
    ]);
    return true;
  }

  async addBank(id, value) {
    if (await isOnline(id)) return false;
    await sql("UPDATE vrp_user_moneys SET bank=bank+? WHERE user_id=?", [
      value,
      id,
    ]);
    return true;
  }

  async addWeapon(id, weapon, ammo) {
    if (await isOnline(id)) return false;
    const res = await sql(
      "SELECT dvalue FROM vrp_user_data WHERE user_id='" +
        id +
        "' AND dkey='vRP:datatable'"
    );
    if (res.length > 0) {
      const data = JSON.parse(res[0].dvalue);
      if (Array.isArray(data.weapons)) {
        data.weapons = { weapon: { ammo } };
      } else if (data.weapons[weapon] && data.weapons[weapon].ammo) {
        data.weapons[weapon][ammo] += ammo;
      } else data.weapons[weapon] = { ammo };
      await sql(
        "UPDATE vrp_user_data SET dvalue=? WHERE user_id=? AND dkey='vRP:datatable'",
        [JSON.stringify(data), id]
      );
      return true;
    } else {
      webhook.debug("Não foi encontrado nenhum dvalue para " + id);
      return false;
    }
  }

  async addInventory(id, item, amount) {
    if (await isOnline(id)) return false;
    const res = await sql(
      "SELECT dvalue FROM vrp_user_data WHERE user_id='" +
        id +
        "' AND dkey='vRP:datatable'"
    );
    if (res.length > 0) {
      const data = JSON.parse(res[0].dvalue);
      if (Array.isArray(data.inventory)) {
        data.inventory = {};
      }
      if (data.inventory[item] && data.inventory[item].amount) {
        data.inventory[item] = { amount: data.inventory[item].amount + amount };
      } else data.inventory[item] = { amount };
      await sql(
        "UPDATE vrp_user_data SET dvalue=? WHERE user_id=? AND dkey='vRP:datatable'",
        [JSON.stringify(data), id]
      );
      return true;
    } else {
      webhook.debug("Não foi encontrado nenhum dvalue para " + id);
      return false;
    }
  }
}

module.exports = new VRP();
