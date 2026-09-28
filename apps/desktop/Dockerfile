FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive LANG=zh_CN.UTF-8 LANGUAGE=zh_CN:zh

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        locales \
        xvfb \
        x11vnc \
        xfce4 \
        xfce4-terminal \
        dbus-x11 \
        firefox-esr \
        websockify \
        novnc \
        fonts-noto-cjk \
        fonts-noto-color-emoji \
        ca-certificates \
        procps \
        python3 \
    && rm -rf /var/lib/apt/lists/* \
    && sed -i 's/^# *zh_CN.UTF-8/zh_CN.UTF-8/' /etc/locale.gen \
    && locale-gen \
    && userdel -r user 2>/dev/null || true \
    && useradd -m -u 1000 -s /bin/bash openmuse \
    && mkdir -p /workspace /home/openmuse/.config/xfce4/xfconf/xfce-perchannel-xml \
    && chown -R 1000:1000 /workspace /home/openmuse

# Suppress Xfce first-run dialogs; disable session-save prompt.
COPY xfce4-session.xml /home/openmuse/.config/xfce4/xfconf/xfce-perchannel-xml/xfce4-session.xml
COPY xfce4-desktop.xml /home/openmuse/.config/xfce4/xfconf/xfce-perchannel-xml/xfce4-desktop.xml
RUN chown -R 1000:1000 /home/openmuse/.config \
    && install -d -m 0755 /usr/lib/firefox-esr/distribution
COPY policies.json /usr/lib/firefox-esr/distribution/policies.json

COPY start-desktop.sh /opt/openmuse/start-desktop.sh
RUN chmod 0555 /opt/openmuse/start-desktop.sh

ENV HOME=/home/openmuse DISPLAY=:1 SCREEN_SIZE=1600x900x24 VNC_PORT=5900 NOVNC_PORT=6080
EXPOSE 6080
USER 1000:1000
WORKDIR /workspace
ENTRYPOINT ["/opt/openmuse/start-desktop.sh"]
