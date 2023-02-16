// SPDX-License-Identifier: GPL-3.0-or-later
/*
    Animal Rights Advocates Discord Bot
    Copyright (C) 2022  Anthony Berg

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { Listener } from '@sapphire/framework';
import type { GuildBan } from 'discord.js';
import { AuditLogEvent, EmbedBuilder, TextChannel } from 'discord.js';
import { addBan, checkActive, removeBan } from '#utils/database/ban';
import IDs from '#utils/ids';
import { addEmptyUser, addExistingUser, userExists } from '#utils/database/dbExistingUser';

export class UnbanListener extends Listener {
  public constructor(context: Listener.Context, options: Listener.Options) {
    super(context, {
      ...options,
      event: 'guildBanRemove',
    });
  }

  public async run(ban: GuildBan) {
    // Check if the bot unbanned the user
    const logs = await ban.guild.fetchAuditLogs({
      limit: 1,
      type: AuditLogEvent.MemberBanRemove,
    });

    const banLog = logs.entries.first();

    if (banLog === undefined) {
      return;
    }

    const { executor, target } = banLog;

    if (ban.user !== target) {
      return;
    }

    if (executor === null) {
      return;
    }

    if (this.container.client.user === null) {
      this.container.logger.error('UnbanListener: client.user is null.');
      return;
    }

    if (executor.id === this.container.client.user.id) {
      return;
    }

    const { user } = ban;
    const { guild } = ban;

    // Gets mod's GuildMember
    let mod = guild.members.cache.get(executor.id);

    // Checks if GuildMember is null
    if (mod === undefined) {
      mod = await guild.members.fetch(executor.id)
        .catch(() => undefined);
      if (mod === undefined) {
        this.container.logger.error('UnbanListener: Could not fetch moderator.');
        return;
      }
    }

    // Check if mod is in database
    if (!await userExists(mod.id)) {
      await addExistingUser(mod);
    }

    // Check for missing ban on database
    if (!await checkActive(user.id)) {
      // Check if user and mod are on the database
      if (!await userExists(user.id)) {
        await addEmptyUser(user.id);
      }
      // Add missing ban
      await addBan(user.id, mod.id, '(Mod who banned is not accurate) - ');
    }

    // Add unban to database
    await removeBan(user.id, mod.id);

    // Log the ban
    let logChannel = guild.channels.cache
      .get(IDs.channels.logs.restricted) as TextChannel | undefined;

    if (logChannel === undefined) {
      logChannel = await guild.channels
        .fetch(IDs.channels.logs.restricted) as TextChannel | undefined;
      if (logChannel === undefined) {
        this.container.logger.error('UnbanListener: Could not fetch log channel');
        return;
      }
    }

    const log = new EmbedBuilder()
      .setColor('#28A745')
      .setAuthor({ name: `Unbanned ${user.tag} (not done via bot)`, iconURL: `${user.avatarURL()}` })
      .addFields(
        { name: 'User', value: `${user}`, inline: true },
        { name: 'Moderator', value: `${mod}`, inline: true },
      )
      .setTimestamp()
      .setFooter({ text: `ID: ${user.id}` });

    await logChannel.send({ embeds: [log] });
  }
}
