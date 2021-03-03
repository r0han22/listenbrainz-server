import * as React from "react";
import * as ReactDOM from "react-dom";

import {
  faCircle,
  faHeart,
  faListUl,
  faMusic,
  faQuestion,
  faUserPlus,
  faUserSecret,
  faUserSlash,
} from "@fortawesome/free-solid-svg-icons";

import { AlertList } from "react-bs-notifier";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { isEqual } from "lodash";
import APIService from "./APIService";
import BrainzPlayer from "./BrainzPlayer";
import FollowerFollowingModal from "./follow/FollowerFollowingModal";
import TimelineEventCard from "./TimelineEventCard";
import fakeData from "./fake-user-feed.json";
import { timestampToTimeAgo } from "./utils";

export enum EventType {
  RECORDING_RECOMMENDATION = "recording_recommendation",
  LIKE = "like",
  FOLLOW = "follow",
  STOP_FOLLOW = "stop_follow",
  BLOCK_FOLLOW = "block_follow",
  PLAYLIST_CREATED = "playlist_created",
}

type UserFeedPageProps = {
  apiUrl: string;
  currentUser: ListenBrainzUser;
  events: TimelineEvent[];
  spotify: SpotifyUser;
};
type UserFeedPageState = {
  currentListen?: Listen;
  alerts: Alert[];
  nextEventTs?: number;
  previousEventTs?: number;
};

export default class UserFeedPage extends React.Component<
  UserFeedPageProps,
  UserFeedPageState
> {
  static isEventListenable(event: TimelineEvent): boolean {
    const { event_type } = event;
    return (
      event_type === EventType.RECORDING_RECOMMENDATION ||
      event_type === EventType.LIKE
    );
  }

  static getEventTypeIcon(eventType: EventTypeT) {
    switch (eventType) {
      case EventType.RECORDING_RECOMMENDATION:
        return faMusic;
      case EventType.LIKE:
        return faHeart;
      case EventType.FOLLOW:
        return faUserPlus;
      case EventType.STOP_FOLLOW:
        return faUserSlash;
      case EventType.BLOCK_FOLLOW:
        return faUserSecret;
      case EventType.PLAYLIST_CREATED:
        return faListUl;
      default:
        return faQuestion;
    }
  }

  static getEventTypePhrase(eventType: EventTypeT): string {
    switch (eventType) {
      case EventType.RECORDING_RECOMMENDATION:
        return "recommended a song";
      case EventType.LIKE:
        return "added a song to their favorites";
      default:
        return "";
    }
  }

  private APIService: APIService;

  private brainzPlayer = React.createRef<BrainzPlayer>();

  private expectedEventsPerPage = 25;

  constructor(props: UserFeedPageProps) {
    super(props);
    this.state = {
      alerts: [],
      nextEventTs: props.events?.[props.events.length - 1]?.created,
      previousEventTs: props.events?.[0]?.created,
    };

    this.APIService = new APIService(
      props.apiUrl || `${window.location.origin}/1`
    );
  }

  newAlert = (
    type: AlertType,
    title: string,
    message: string | JSX.Element
  ): void => {
    const newAlert: Alert = {
      id: new Date().getTime(),
      type,
      headline: title,
      message,
    };

    this.setState((prevState) => {
      return {
        alerts: [...prevState.alerts, newAlert],
      };
    });
  };

  onAlertDismissed = (alert: Alert): void => {
    const { alerts } = this.state;

    // find the index of the alert that was dismissed
    const idx = alerts.indexOf(alert);

    if (idx >= 0) {
      this.setState({
        // remove the alert from the array
        alerts: [...alerts.slice(0, idx), ...alerts.slice(idx + 1)],
      });
    }
  };

  handleCurrentListenChange = (listen: Listen | JSPFTrack): void => {
    this.setState({ currentListen: listen as Listen });
  };

  isCurrentListen = (listen: Listen): boolean => {
    const { currentListen } = this.state;
    return Boolean(currentListen && isEqual(listen, currentListen));
  };

  playListen = (listen: Listen): void => {
    if (this.brainzPlayer.current) {
      this.brainzPlayer.current.playListen(listen);
    }
  };

  renderEventContent(event: TimelineEvent) {
    const { event_type, metadata } = event;
    if (
      event_type === EventType.RECORDING_RECOMMENDATION ||
      event_type === EventType.LIKE
    ) {
      return (
        <div className="event-content">
          <TimelineEventCard
            className={
              this.isCurrentListen(metadata as Listen) ? " current-listen" : ""
            }
            listen={metadata as Listen}
            newAlert={this.newAlert}
            playListen={this.playListen}
          />
        </div>
      );
    }
    return null;
  }

  renderEventText(event: TimelineEvent) {
    const { currentUser } = this.props;
    const { event_type, user_name, metadata } = event;
    if (event_type === EventType.FOLLOW) {
      const { user_0, user_1 } = metadata as UserRelationshipEvent;
      const currentUserFollows = currentUser.name === user_0;
      let text;
      if (currentUserFollows) {
        return (
          <span className="event-description-text">
            You are now following <a href={`/user/${user_1}`}>{user_1}</a>
          </span>
        );
      }
      return (
        <span className="event-description-text">
          <a href={`/user/${user_0}`}>{user_0}</a> is now following you
        </span>
      );
    }
    if (event_type === EventType.PLAYLIST_CREATED) {
      const { identifier, title } = metadata as JSPFPlaylist;
      return (
        <span className="event-description-text">
          We created a playlist for you: <a href={identifier}>{title}</a>
        </span>
      );
    }

    return (
      <span className="event-description-text">
        <a
          href={`/user/${user_name}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {user_name}
        </a>
        &ensp;
        {UserFeedPage.getEventTypePhrase(event_type)}&ensp;
      </span>
    );
  }

  render() {
    const { currentUser, events, spotify } = this.props;
    const { alerts, currentListen, previousEventTs, nextEventTs } = this.state;

    const listens = events
      .filter(UserFeedPage.isEventListenable)
      .map((event) => event.metadata) as Listen[];

    return (
      <>
        <h2>Latest activity</h2>
        <div role="main">
          <AlertList
            position="bottom-right"
            alerts={alerts}
            timeout={15000}
            dismissTitle="Dismiss"
            onDismiss={this.onAlertDismissed}
          />
          <div className="row">
            <div className="col-md-7">
              <div id="timeline">
                <ul>
                  {events.map((event) => {
                    const { created, event_type, user_name } = event;
                    return (
                      <li
                        className="timeline-event"
                        key={`event-${user_name}-${created}`}
                      >
                        <div className="event-description">
                          <span className={`event-icon ${event_type}`}>
                            <span className="fa-layers">
                              <FontAwesomeIcon
                                icon={faCircle as IconProp}
                                transform="grow-8"
                              />
                              <FontAwesomeIcon
                                icon={
                                  UserFeedPage.getEventTypeIcon(
                                    event_type
                                  ) as IconProp
                                }
                                inverse
                                transform="shrink-4"
                              />
                            </span>
                          </span>
                          {this.renderEventText(event)}

                          <span className="event-time">
                            {timestampToTimeAgo(created)}
                          </span>
                        </div>

                        {this.renderEventContent(event)}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
            <div className="col-md-offset-1 col-md-4">
              <FollowerFollowingModal user={currentUser} />
              <BrainzPlayer
                apiService={this.APIService}
                currentListen={currentListen}
                direction="down"
                listens={listens}
                newAlert={this.newAlert}
                onCurrentListenChange={this.handleCurrentListenChange}
                ref={this.brainzPlayer}
                spotifyUser={spotify}
              />
            </div>
          </div>
        </div>
      </>
    );
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const domContainer = document.querySelector("#react-container");
  const propsElement = document.getElementById("react-props");
  const reactProps = JSON.parse(propsElement!.innerHTML);
  const { api_url, current_user, spotify } = reactProps;
  ReactDOM.render(
    <UserFeedPage
      currentUser={current_user}
      events={fakeData.payload.feed as TimelineEvent[]}
      apiUrl={api_url}
      spotify={spotify}
    />,
    domContainer
  );
});
