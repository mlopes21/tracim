import React from 'react'
import WorkspaceAdvancedConfiguration from '../component/WorkspaceAdvancedConfiguration.jsx'
import { translate } from 'react-i18next'
import i18n from '../i18n.js'
import {
  addAllResourceI18n,
  handleFetchResult,
  PopinFixed,
  PopinFixedHeader,
  PopinFixedOption,
  PopinFixedContent,
  PopinFixedRightPart,
  CUSTOM_EVENT,
  appFeatureCustomEventHandlerShowApp
} from 'tracim_frontend_lib'
import { debug } from '../debug.js'
import {
  getWorkspaceDetail,
  getWorkspaceMember,
  putLabel,
  putDescription,
  putAgendaEnabled,
  putDownloadEnabled,
  putUploadEnabled,
  putMemberRole,
  deleteMember,
  getMyselfKnownMember,
  postWorkspaceMember,
  deleteWorkspace,
  getAppList
} from '../action.async.js'
import Radium from 'radium'
import WorkspaceMembersList from '../component/WorkspaceMembersList.jsx'
import OptionalFunctionalities from '../component/OptionalFunctionalities.jsx'

class WorkspaceAdvanced extends React.Component {
  constructor (props) {
    super(props)
    this.state = {
      appName: 'workspace_advanced',
      isVisible: true,
      config: props.data ? props.data.config : debug.config,
      loggedUser: props.data ? props.data.loggedUser : debug.loggedUser,
      content: props.data ? props.data.content : debug.content,
      displayFormNewMember: false,
      newMember: {
        id: '',
        nameOrEmail: '',
        role: '',
        avatarUrl: '',
        isEmail: false
      },
      autoCompleteFormNewMemberActive: false,
      autoCompleteClicked: false,
      searchedKnownMemberList: [],
      displayPopupValidateDeleteWorkspace: false
    }

    // i18n has been init, add resources from frontend
    addAllResourceI18n(i18n, this.state.config.translation, this.state.loggedUser.lang)
    i18n.changeLanguage(this.state.loggedUser.lang)

    document.addEventListener(CUSTOM_EVENT.APP_CUSTOM_EVENT_LISTENER, this.customEventReducer)
  }

  customEventReducer = ({ detail: { type, data } }) => { // action: { type: '', data: {} }
    const { state } = this
    switch (type) {
      case CUSTOM_EVENT.SHOW_APP(state.config.slug):
        console.log('%c<WorkspaceAdvanced> Custom event', 'color: #28a745', type, data)
        const isSameContentId = appFeatureCustomEventHandlerShowApp(data.content, state.content.content_id, state.content.content_type)
        if (isSameContentId) {
          this.setState({ isVisible: true })
          this.buildBreadcrumbs()
        }
        // this.setState({ isVisible: true })
        // this.loadContent()
        break
      case CUSTOM_EVENT.HIDE_APP(state.config.slug):
        console.log('%c<WorkspaceAdvanced> Custom event', 'color: #28a745', type, data)
        this.setState({ isVisible: false })
        break
      case CUSTOM_EVENT.RELOAD_CONTENT(state.config.slug):
        console.log('%c<WorkspaceAdvanced> Custom event', 'color: #28a745', type, data)
        this.setState(prev => ({ content: { ...prev.content, ...data }, isVisible: true }))
        break
      case CUSTOM_EVENT.ALL_APP_CHANGE_LANGUAGE:
        console.log('%c<WorkspaceAdvanced> Custom event', 'color: #28a745', type, data)
        this.setState(prev => ({
          loggedUser: {
            ...prev.loggedUser,
            lang: data
          }
        }))
        i18n.changeLanguage(data)
        this.loadContent()
        break
    }
  }

  componentDidMount () {
    console.log('%c<WorkspaceAdvanced> did mount', `color: ${this.state.config.hexcolor}`)

    this.loadContent()
  }

  componentDidUpdate (prevProps, prevState) {
    const { state } = this
    console.log('%c<WorkspaceAdvanced> did update', `color: ${state.config.hexcolor}`, prevState, state)

    if (prevState.content && state.content && prevState.content.workspace_id !== state.content.workspace_id) {
      this.loadContent()
    }
  }

  componentWillUnmount () {
    console.log('%c<WorkspaceAdvanced> will Unmount', `color: ${this.state.config.hexcolor}`)
    document.removeEventListener(CUSTOM_EVENT.APP_CUSTOM_EVENT_LISTENER, this.customEventReducer)
  }

  sendGlobalFlashMessage = (msg, type = 'info') => GLOBAL_dispatchEvent({
    type: CUSTOM_EVENT.ADD_FLASH_MSG,
    data: {
      msg: msg,
      type: type,
      delay: undefined
    }
  })

  loadContent = async () => {
    const { props, state } = this

    const fetchWorkspaceDetail = handleFetchResult(await getWorkspaceDetail(state.config.apiUrl, state.content.workspace_id))
    const fetchWorkspaceMember = handleFetchResult(await getWorkspaceMember(state.config.apiUrl, state.content.workspace_id))
    const fetchAppList = handleFetchResult(await getAppList(state.config.apiUrl))

    const [resDetail, resMember, resAppList] = await Promise.all([fetchWorkspaceDetail, fetchWorkspaceMember, fetchAppList])

    if (resDetail.apiResponse.status !== 200) {
      this.sendGlobalFlashMessage(props.t('Error while loading shared space details', 'warning'))
      resDetail.body = {}
    }
    if (resMember.apiResponse.status !== 200) {
      this.sendGlobalFlashMessage(props.t('Error while loading members list', 'warning'))
      resMember.body = []
    }
    if (resAppList.apiResponse.status !== 200) {
      this.sendGlobalFlashMessage(props.t('Error while loading app list', 'warning'))
      resAppList.body = []
    }

    this.setState({
      content: {
        ...resDetail.body,
        memberList: resMember.body,
        appAgendaAvailable: resAppList.body.some(a => a.slug === 'agenda')
      }
    })
  }

  handleClickBtnCloseApp = () => {
    this.setState({ isVisible: false })
    GLOBAL_dispatchEvent({ type: CUSTOM_EVENT.APP_CLOSED, data: {} })
  }

  handleSaveEditLabel = async newLabel => {
    const { props, state } = this
    const fetchPutWorkspaceLabel = await handleFetchResult(await putLabel(state.config.apiUrl, state.content, newLabel))

    switch (fetchPutWorkspaceLabel.apiResponse.status) {
      case 200:
        this.setState(prev => ({ content: { ...prev.content, label: newLabel } }))
        GLOBAL_dispatchEvent({ type: CUSTOM_EVENT.REFRESH_WORKSPACE_LIST, data: {} })
        GLOBAL_dispatchEvent({ type: CUSTOM_EVENT.REFRESH_WORKSPACE_DETAIL, data: {} })
        break
      default: this.sendGlobalFlashMessage(props.t('Error while saving new shared space label', 'warning'))
    }
  }

  handleClickToggleFormNewMember = () => this.setState(prev => ({ displayFormNewMember: !prev.displayFormNewMember }))

  handleChangeDescription = e => {
    const newDescription = e.target.value
    this.setState(prev => ({ content: { ...prev.content, description: newDescription } }))
  }

  handleClickValidateNewDescription = async () => {
    const { props, state } = this
    const fetchPutDescription = await handleFetchResult(await putDescription(state.config.apiUrl, state.content, state.content.description))

    switch (fetchPutDescription.apiResponse.status) {
      case 200:
        this.sendGlobalFlashMessage(props.t('Save successful', 'info'))
        GLOBAL_dispatchEvent({ type: CUSTOM_EVENT.REFRESH_WORKSPACE_LIST, data: {} })
        GLOBAL_dispatchEvent({ type: CUSTOM_EVENT.REFRESH_WORKSPACE_DETAIL, data: {} })
        break
      default: this.sendGlobalFlashMessage(props.t('Error while saving new description', 'warning'))
    }
  }

  handleClickNewRole = async (memberId, slugNewRole) => {
    const { props, state } = this
    const fetchPutUserRole = await handleFetchResult(await putMemberRole(state.config.apiUrl, state.content.workspace_id, memberId, slugNewRole))

    switch (fetchPutUserRole.apiResponse.status) {
      case 200:
        this.setState(prev => ({
          content: {
            ...prev.content,
            memberList: prev.content.memberList.map(m => m.user_id === memberId ? { ...m, role: slugNewRole } : m)
          }
        }))
        GLOBAL_dispatchEvent({ type: CUSTOM_EVENT.REFRESH_DASHBOARD_MEMBER_LIST, data: {} })
        break
      default: this.sendGlobalFlashMessage(props.t('Error while saving new role for member', 'warning'))
    }
  }

  handleToggleAgendaEnabled = async () => {
    const { props, state } = this
    const oldAgendaEnabledValue = state.content.agenda_enabled
    const newAgendaEnabledValue = !state.content.agenda_enabled

    this.setState(prev => ({ content: { ...prev.content, agenda_enabled: newAgendaEnabledValue } }))
    const fetchToggleAgendaEnabled = await handleFetchResult(await putAgendaEnabled(state.config.apiUrl, state.content, newAgendaEnabledValue))

    switch (fetchToggleAgendaEnabled.apiResponse.status) {
      case 200:
        this.sendGlobalFlashMessage(
          newAgendaEnabledValue ? props.t('Agenda activated') : props.t('Agenda deactivated'),
          'info'
        )
        GLOBAL_dispatchEvent({ type: CUSTOM_EVENT.REFRESH_WORKSPACE_LIST, data: {} })
        GLOBAL_dispatchEvent({ type: CUSTOM_EVENT.REFRESH_WORKSPACE_DETAIL, data: {} })
        break
      default:
        this.setState(prev => ({ content: { ...prev.content, agenda_enabled: oldAgendaEnabledValue } }))
        this.sendGlobalFlashMessage(
          newAgendaEnabledValue
            ? props.t('Error while activating agenda')
            : props.t('Error while deactivating agenda'),
          'warning'
        )
    }
  }

  handleToggleUploadEnabled = async () => {
    const { props, state } = this
    const oldUploadEnabledValue = state.content.public_upload_enabled
    const newUploadEnabledValue = !state.content.public_upload_enabled

    this.setState(prev => ({ content: { ...prev.content, public_upload_enabled: newUploadEnabledValue } }))
    const fetchToggleUploadEnabled = await handleFetchResult(await putUploadEnabled(state.config.apiUrl, state.content, newUploadEnabledValue))

    switch (fetchToggleUploadEnabled.apiResponse.status) {
      case 200:
        this.sendGlobalFlashMessage(
          newUploadEnabledValue ? props.t('Upload activated') : props.t('Upload deactivated'),
          'info'
        )
        GLOBAL_dispatchEvent({ type: CUSTOM_EVENT.REFRESH_WORKSPACE_LIST, data: {} })
        GLOBAL_dispatchEvent({ type: CUSTOM_EVENT.REFRESH_WORKSPACE_DETAIL, data: {} })
        break
      default:
        this.setState(prev => ({ content: { ...prev.content, public_upload_enabled: oldUploadEnabledValue } }))
        this.sendGlobalFlashMessage(
          newUploadEnabledValue
            ? props.t('Error while activating upload')
            : props.t('Error while deactivating upload'),
          'warning'
        )
    }
  }

  handleToggleDownloadEnabled = async () => {
    const { props, state } = this
    const oldDownloadEnabledValue = state.content.public_download_enabled
    const newDownloadEnabledValue = !state.content.public_download_enabled

    this.setState(prev => ({ content: { ...prev.content, public_download_enabled: newDownloadEnabledValue } }))
    const fetchToggleDownloadEnabled = await handleFetchResult(await putDownloadEnabled(state.config.apiUrl, state.content, newDownloadEnabledValue))

    switch (fetchToggleDownloadEnabled.apiResponse.status) {
      case 200:
        this.sendGlobalFlashMessage(
          newDownloadEnabledValue ? props.t('Download activated') : props.t('Download deactivated'),
          'info'
        )
        GLOBAL_dispatchEvent({ type: CUSTOM_EVENT.REFRESH_WORKSPACE_LIST, data: {} })
        GLOBAL_dispatchEvent({ type: CUSTOM_EVENT.REFRESH_WORKSPACE_DETAIL, data: {} })
        break
      default:
        this.setState(prev => ({ content: { ...prev.content, public_download_enabled: oldDownloadEnabledValue } }))
        this.sendGlobalFlashMessage(
          newDownloadEnabledValue
            ? props.t('Error while activating download')
            : props.t('Error while deactivating download'),
          'warning'
        )
    }
  }

  handleClickNewMemberRole = slugRole => this.setState(prev => ({ newMember: { ...prev.newMember, role: slugRole } }))

  isEmail = string => /\S*@\S*\.\S{2,}/.test(string)

  handleChangeNewMemberName = async newNameOrEmail => {
    this.setState(prev => ({
      newMember: {
        ...prev.newMember,
        nameOrEmail: newNameOrEmail,
        isEmail: this.isEmail(newNameOrEmail)
      },
      autoCompleteClicked: false
    }))

    if (newNameOrEmail.length >= 2) {
      await this.handleSearchUser(newNameOrEmail)
      this.setState({ autoCompleteFormNewMemberActive: true })
    }
  }

  handleClickKnownMember = knownMember => {
    this.setState(prev => ({
      newMember: {
        ...prev.newMember,
        id: knownMember.user_id,
        nameOrEmail: knownMember.public_name,
        avatarUrl: knownMember.avatar_url,
        isEmail: false
      },
      autoCompleteFormNewMemberActive: false,
      autoCompleteClicked: true
    }))
  }

  handleClickAutoComplete = () => this.setState({
    autoCompleteFormNewMemberActive: false,
    autoCompleteClicked: true
  })

  handleSearchUser = async userNameToSearch => {
    const { props, state } = this
    const fetchUserKnownMemberList = await handleFetchResult(await getMyselfKnownMember(state.config.apiUrl, userNameToSearch, state.content.workspace_id))
    switch (fetchUserKnownMemberList.apiResponse.status) {
      case 200: this.setState({ searchedKnownMemberList: fetchUserKnownMemberList.body }); break
      default: this.sendGlobalFlashMessage(props.t('Error while fetching known members list', 'warning'))
    }
  }

  handleClickDeleteMember = async userId => {
    const { props, state } = this
    const fetchDeleteMember = await deleteMember(state.config.apiUrl, state.content.workspace_id, userId)
    switch (fetchDeleteMember.status) {
      case 204:
        this.setState(prev => ({
          content: {
            ...prev.content,
            memberList: prev.content.memberList.filter(m => m.user_id !== userId)
          }
        }))
        this.sendGlobalFlashMessage(props.t('Member removed', 'info'))
        GLOBAL_dispatchEvent({ type: CUSTOM_EVENT.REFRESH_WORKSPACE_LIST, data: {} })
        GLOBAL_dispatchEvent({ type: CUSTOM_EVENT.REFRESH_WORKSPACE_DETAIL, data: {} })
        break
      default: this.sendGlobalFlashMessage(props.t('Error while removing member', 'warning'))
    }
  }

  handleClickValidateNewMember = async () => {
    const { props, state } = this

    if (state.newMember.nameOrEmail === '') {
      this.sendGlobalFlashMessage(props.t('Please set a name or email'), 'warning')
      return
    }

    if (state.newMember.role === '') {
      this.sendGlobalFlashMessage(props.t('Please set a role'), 'warning')
      return
    }

    const newMemberInKnownMemberList = state.searchedKnownMemberList.find(u => u.public_name === state.newMember.nameOrEmail)

    if (
      state.config.system && state.config.system.config &&
      !state.config.system.config.email_notification_activated &&
      !newMemberInKnownMemberList
    ) {
      this.sendGlobalFlashMessage(props.t('Unknown user'), 'warning')
      return false
    }

    if (state.newMember.id === '' && newMemberInKnownMemberList) { // this is to force sending the id of the user to the api if he exists
      this.setState({ newMember: { ...state.newMember, id: newMemberInKnownMemberList.user_id } })
    }

    const fetchWorkspaceNewMember = await handleFetchResult(await postWorkspaceMember(state.config.apiUrl, state.content.workspace_id, {
      id: state.newMember.id || newMemberInKnownMemberList ? newMemberInKnownMemberList.user_id : null,
      publicName: state.newMember.isEmail ? '' : state.newMember.nameOrEmail,
      email: state.newMember.isEmail ? state.newMember.nameOrEmail : '',
      role: state.newMember.role
    }))

    switch (fetchWorkspaceNewMember.apiResponse.status) {
      case 200:
        this.loadContent()
        this.setState({
          newMember: {
            id: '',
            nameOrEmail: '',
            role: '',
            avatarUrl: '',
            isEmail: false
          },
          autoCompleteFormNewMemberActive: false,
          displayFormNewMember: false
        })
        this.sendGlobalFlashMessage(props.t('Member added', 'info'))
        GLOBAL_dispatchEvent({ type: CUSTOM_EVENT.REFRESH_WORKSPACE_LIST, data: {} })
        GLOBAL_dispatchEvent({ type: CUSTOM_EVENT.REFRESH_WORKSPACE_DETAIL, data: {} })
        break
      case 400:
        switch (fetchWorkspaceNewMember.body.code) {
          case 2042: this.sendGlobalFlashMessage(props.t('This account is deactivated'), 'warning'); break
          case 1001:
            const ErrorMsg = () => (
              <div>
                {props.t('Unknown user')}<br />
                {props.t('Note, only administrators can send invitational email')}
              </div>
            )
            this.sendGlobalFlashMessage(<ErrorMsg />, 'warning')
            break
          case 3008: this.sendGlobalFlashMessage(props.t('This user already is in the shared space'), 'warning'); break
          default: this.sendGlobalFlashMessage(props.t('Error while adding the member to the shared space'), 'warning')
        }
        break
      default: this.sendGlobalFlashMessage(props.t('Error while adding the member to the shared space', 'warning'))
    }
  }

  handleClickDeleteWorkspaceBtn = () => this.setState({ displayPopupValidateDeleteWorkspace: true })

  handleClickClosePopupDeleteWorkspace = () => this.setState({ displayPopupValidateDeleteWorkspace: false })

  handleClickValidateDeleteWorkspace = async () => {
    const { props, state } = this

    const fetchDeleteWorkspace = await deleteWorkspace(state.config.apiUrl, state.content.workspace_id)
    switch (fetchDeleteWorkspace.status) {
      case 204:
        GLOBAL_dispatchEvent({ type: CUSTOM_EVENT.REFRESH_WORKSPACE_LIST_THEN_REDIRECT, data: { url: '/ui' } })
        // GLOBAL_dispatchEvent({type: 'refreshWorkspaceList', data: {}})
        this.handleClickBtnCloseApp()
        break
      default: this.sendGlobalFlashMessage(props.t('Error while deleting shared space', 'warning'))
    }
  }

  render () {
    const { state } = this

    if (!state.isVisible) return null
    console.log(state.content.public_download_enabled)
    return (
      <PopinFixed
        customClass={`${state.config.slug}`}
        customColor={state.config.hexcolor}
      >
        <PopinFixedHeader
          customClass={`${state.config.slug}`}
          customColor={state.config.hexcolor}
          faIcon={state.config.faIcon}
          rawTitle={state.content.label}
          componentTitle={<div>{state.content.label}</div>}
          userRoleIdInWorkspace={state.loggedUser.userRoleIdInWorkspace}
          onClickCloseBtn={this.handleClickBtnCloseApp}
          onValidateChangeTitle={this.handleSaveEditLabel}
        />

        <PopinFixedOption
          customColor={state.config.hexcolor}
          customClass={`${state.config.slug}`}
          i18n={i18n}
          display={false}
        />

        <PopinFixedContent
          customClass={`${state.config.slug}__contentpage`}
        >
          <WorkspaceAdvancedConfiguration
            customColor={state.config.hexcolor}
            description={state.content.description}
            displayPopupValidateDeleteWorkspace={state.displayPopupValidateDeleteWorkspace}
            onClickValidateNewDescription={this.handleClickValidateNewDescription}
            onClickClosePopupDeleteWorkspace={this.handleClickClosePopupDeleteWorkspace}
            onClickDeleteWorkspaceBtn={this.handleClickDeleteWorkspaceBtn}
            onClickValidatePopupDeleteWorkspace={this.handleClickValidateDeleteWorkspace}
            onChangeDescription={this.handleChangeDescription}
            key={'workspace_advanced'}
          />

          <PopinFixedRightPart
            customClass={`${state.config.slug}__contentpage`}
            customColor={state.config.hexcolor}
            menuItemList={[
              {
                id: 'members_list',
                label: this.props.t('Members List'),
                icon: 'fa-users',
                children: <WorkspaceMembersList
                  displayFormNewMember={state.displayFormNewMember}
                  memberList={state.content.memberList}
                  roleList={state.config.roleList}
                  onClickNewRole={this.handleClickNewRole}
                  loggedUser={state.loggedUser}
                  onClickDeleteMember={this.handleClickDeleteMember}
                  onClickToggleFormNewMember={this.handleClickToggleFormNewMember}
                  newMemberName={state.newMember.nameOrEmail}
                  isEmail={state.newMember.isEmail}
                  onChangeNewMemberName={this.handleChangeNewMemberName}
                  searchedKnownMemberList={state.searchedKnownMemberList}
                  onClickKnownMember={this.handleClickKnownMember}
                  newMemberRole={state.newMember.role}
                  onClickNewMemberRole={this.handleClickNewMemberRole}
                  onClickValidateNewMember={this.handleClickValidateNewMember}
                  autoCompleteFormNewMemberActive={state.autoCompleteFormNewMemberActive}
                  emailNotifActivated={state.config.system.config.email_notification_activated}
                  canSendInviteNewUser={
                    [state.config.profileObject.administrator.slug, state.config.profileObject.manager.slug].includes(state.loggedUser.profile)
                  }
                  userRoleIdInWorkspace={state.loggedUser.userRoleIdInWorkspace}
                  autoCompleteClicked={state.autoCompleteClicked}
                  onClickAutoComplete={this.handleClickAutoComplete}
                />
              },
              {
                id: 'optional_functionalities',
                label: this.props.t('Optional Functionalities'),
                icon: 'fa-cog',
                children: <OptionalFunctionalities
                  appAgendaAvailable={state.content.appAgendaAvailable}
                  agendaEnabled={state.content.agenda_enabled}
                  onToggleAgendaEnabled={this.handleToggleAgendaEnabled}
                  downloadEnabled={state.content.public_download_enabled}
                  onToggleDownloadEnabled={this.handleToggleDownloadEnabled}
                  uploadEnabled={state.content.public_upload_enabled}
                  onToggleUploadEnabled={this.handleToggleUploadEnabled}
                />
              }
            ]}
          />
        </PopinFixedContent>
      </PopinFixed>
    )
  }
}

export default translate()(Radium(WorkspaceAdvanced))
